import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './utils/jwt.js';
import logger from './utils/logger.js';
import config from './config.js';
import CharacterService from './services/CharacterService.js';
import MovementService from './services/MovementService.js';
import ExplorationService from './services/ExplorationService.js';
import ResourceService from './services/ResourceService.js';
import InventoryService from './services/InventoryService.js';
import ChatMessageService from './services/ChatMessageService.js';
import PluginService from './services/PluginService.js';
import BuildService from './services/BuildService.js';
import FriendService from './services/FriendService.js';
import { query } from './db/mysql.js';

/**
 * In-memory map: characterId → Set<socketId>.
 * Used to deliver friend notifications to the correct socket(s) even when
 * the target is in a different chunk room.
 */
const characterSocketMap = new Map<string, Set<string>>();

/** Find a socket for a given characterId (returns the first connected one). */
function getSocketForCharacter(io: SocketIOServer, characterId: string): Socket | null {
  const socketIds = characterSocketMap.get(characterId);
  if (!socketIds || socketIds.size === 0) return null;
  for (const sid of socketIds) {
    const s = io.sockets.sockets.get(sid);
    if (s) return s;
  }
  return null;
}

interface SocketData {
  user: {
    userId: string;
    username: string;
  };
  character?: {
    id: string;
    nickname: string;
    chunkId: string;
  };
  currentRoomId?: string;
  cacheRefreshTimer?: NodeJS.Timeout;
}

/**
 * Collect the current member list of a Socket.io room from connected sockets.
 */
async function getRoomMembers(
  io: SocketIOServer,
  roomKey: string
): Promise<Array<{ characterId: string; nickname: string }>> {
  const sockets = await io.in(roomKey).fetchSockets();
  const members: Array<{ characterId: string; nickname: string }> = [];
  for (const s of sockets) {
    const data = s.data as SocketData;
    if (data.character) {
      members.push({ characterId: data.character.id, nickname: data.character.nickname });
    }
  }
  return members;
}

export const initializeSocketIO = (httpServer: HTTPServer) => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
    },
  });

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = verifyAccessToken(token);
      (socket.data as SocketData).user = {
        userId: payload.userId,
        username: payload.username,
      };

      // Load character data
      const character = await CharacterService.getCharacterByUserId(payload.userId);
      if (character) {
        (socket.data as SocketData).character = {
          id: character.id.toString(),
          nickname: character.nickname,
          chunkId: character.currentChunkId,
        };
      }

      logger.info(`Socket authenticated: ${payload.username} (${payload.userId})`);
      next();
    } catch (error: any) {
      logger.error('Socket authentication failed', { error: error.message });
      next(new Error('Authentication failed: ' + error.message));
    }
  });

  // Connection handler
  io.on('connection', async (socket: Socket) => {
    const socketData = socket.data as SocketData;
    const user = socketData.user;
    const character = socketData.character;

    logger.info(`Client connected: ${user?.username} (${socket.id})`);

    // IMPORTANT: register every event handler synchronously BEFORE any `await`
    // below. Socket.IO does not buffer incoming events on the server side, so a
    // client emit that arrives while the async connection setup is still in
    // flight would otherwise be silently dropped. This is especially critical
    // for 'client:request-chunk-players', which the client fires immediately
    // after its own listeners are ready (WorldScene.create).

    // Client explicitly asks for the current chunk roster once its own
    // event listeners are registered — avoids the connect-time race where
    // the server's push could arrive before the client is ready to receive it.
    socket.on('client:request-chunk-players', async () => {
      if (!character) return;

      const playersInChunk = await MovementService.getPlayersInChunk(character.chunkId);
      const otherPlayers = playersInChunk.filter(p => p.characterId !== character.id);

      socket.emit('players:in-chunk', {
        players: otherPlayers.map(p => ({
          characterId: p.characterId,
          nickname: p.nickname,
          position: p.position,
        })),
      });
    });

    socket.on('client:request-chunk-map', async (data: { chunkId?: string }) => {
      if (!character || data?.chunkId !== character.chunkId) return;

      // The client uses this shared seed to generate the same tile types;
      // this acknowledgement establishes the authoritative chunk identity.
      socket.emit('map:chunk-data', {
        chunkId: character.chunkId,
        tiles: [],
      });
    });

    // Handle player movement
    socket.on('player:move', async (data: { x: number; y: number }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }

      try {
        const result = await MovementService.handlePlayerMove(
          user.userId,
          character.id,
          character.nickname,
          { x: data.x, y: data.y }
        );

        // If chunk changed, handle room switching
        if (result.chunkChanged && result.oldChunkId) {
          // Leave old chunk room
          socket.leave(result.oldChunkId);

          // Notify old chunk that player left
          socket.to(result.oldChunkId).emit('player:leave-chunk', {
            characterId: character.id,
          });

          // Join new chunk room
          socket.join(result.chunkId);
          character.chunkId = result.chunkId;

          logger.info(
            `${character.nickname} moved from chunk ${result.oldChunkId} to ${result.chunkId}`
          );

          // 移动进入新区块时探索其 3x3 范围（迷雾）
          const newlyExplored = await ExplorationService.exploreArea(
            character.id,
            result.chunkId,
            1
          );
          if (newlyExplored.length > 0) {
            socket.emit('map:explore', { chunks: newlyExplored });
          }

          // Get players in new chunk
          const playersInNewChunk = await MovementService.getPlayersInChunk(result.chunkId);
          const otherPlayers = playersInNewChunk.filter(p => p.characterId !== character.id);

          // Send new chunk players to this client
          socket.emit('players:in-chunk', {
            players: otherPlayers.map(p => ({
              characterId: p.characterId,
              nickname: p.nickname,
              position: p.position,
            })),
          });

          // Notify new chunk that this player entered
          socket.to(result.chunkId).emit('player:enter-chunk', {
            characterId: character.id,
            nickname: character.nickname,
            position: result.position,
          });
        } else {
          // Broadcast position update to others in same chunk
          socket.to(character.chunkId).emit('players:position-update', {
            characterId: character.id,
            position: result.position,
          });
        }

        // Confirm to client
        socket.emit('player:move-confirmed', {
          position: result.position,
          chunkId: result.chunkId,
        });
      } catch (error: any) {
        logger.error('Player move error', error);
        socket.emit('error', { message: error.message || 'Movement failed' });
      }
    });

    // Echo test (for debugging)
    socket.on('echo', (data) => {
      logger.debug(`Echo received from ${socket.id}:`, data);
      socket.emit('echo', data);
    });

    // Collect a resource node in real-time and broadcast the depletion/refresh
    // so other players in the same chunk see the node update immediately.
    socket.on('resource:collect', async (data: { nodeId: number; x: number; y: number }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }

      try {
        const result = await ResourceService.collectResource(
          data.nodeId,
          character.id,
          { x: data.x, y: data.y }
        );

        if (!result.success) {
          socket.emit('error', { message: result.message ?? 'Collection failed' });
          return;
        }

        const inventory = await InventoryService.getInventory(character.id);

        // Acknowledge to the collector with updated inventory
        socket.emit('resource:collected', {
          nodeId: data.nodeId,
          resourceType: result.resourceType,
          inventory,
        });

        // Notify everyone else in the chunk that this node was collected
        socket.to(character.chunkId).emit('resource:node-depleted', {
          nodeId: data.nodeId,
        });
      } catch (error: any) {
        logger.error('Resource collect error', error);
        socket.emit('error', { message: error.message || 'Collection failed' });
      }
    });

    // ---- Chat room events ----
    // Join a chat room (Socket.io room named `room:<id>`). Broadcasts the
    // member list to everyone in the room and sends history to the joiner.
    socket.on('room:join', async (data: { roomId: string }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      const roomId = String(data?.roomId ?? '');
      if (!/^\d+$/.test(roomId)) {
        socket.emit('error', { message: 'Invalid roomId' });
        return;
      }

      try {
        // Verify the room exists
        const rooms = await BuildService.getRoomsInChunk(character.chunkId);
        const room = rooms.find((r) => String(r.id) === roomId);
        if (!room) {
          // Room may be in another chunk; still allow joining by id if it exists.
          const anyRoom: any = await query('SELECT id FROM chat_rooms WHERE id = ?', [roomId]);
          if (anyRoom.length === 0) {
            socket.emit('error', { message: 'Chat room not found' });
            return;
          }
        }

        const roomKey = `room:${roomId}`;
        socket.join(roomKey);
        socket.data.currentRoomId = roomId;

        // Send history to the joiner
        const history = await ChatMessageService.getHistory(roomId);
        socket.emit('room:history', { roomId, messages: history });

        // Notify everyone (including joiner) of the updated member list
        const members = await getRoomMembers(io, roomKey);
        io.to(roomKey).emit('room:members', { roomId, members });

        // Send active plugins to the joiner
        const activePlugins = PluginService.listActive(roomId);
        if (activePlugins.length > 0) {
          socket.emit('plugin:list', { roomId, plugins: activePlugins });
        }

        logger.info(`${character.nickname} joined chat room ${roomId}`);
      } catch (error: any) {
        logger.error('Room join error', error);
        socket.emit('error', { message: error.message || 'Failed to join room' });
      }
    });

    // Leave a chat room
    socket.on('room:leave', (data: { roomId: string }) => {
      const roomId = String(data?.roomId ?? '');
      if (!/^\d+$/.test(roomId)) return;
      const roomKey = `room:${roomId}`;
      socket.leave(roomKey);
      socket.data.currentRoomId = undefined;
      logger.info(`${character?.nickname ?? 'unknown'} left chat room ${roomId}`);
    });

    // Send a chat message to a room (persist + broadcast)
    socket.on('room:message', async (data: { roomId: string; content: string }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      const roomId = String(data?.roomId ?? '');
      const content = String(data?.content ?? '');
      if (!/^\d+$/.test(roomId)) {
        socket.emit('error', { message: 'Invalid roomId' });
        return;
      }

      try {
        const message = await ChatMessageService.sendMessage(roomId, character.id, content);
        io.to(`room:${roomId}`).emit('room:message', { roomId, message });
      } catch (error: any) {
        logger.error('Room message error', error);
        socket.emit('error', { message: error.message || 'Failed to send message' });
      }
    });

    // ---- Plugin events ----
    // Activate a plugin in a room
    socket.on('plugin:activate', (data: { roomId: string; pluginId: string }) => {
      if (!character) return;
      const roomId = String(data?.roomId ?? '');
      const pluginId = String(data?.pluginId ?? '');
      if (!/^\d+$/.test(roomId) || !pluginId) return;

      const allowedPlugins = ['music-sync', 'video-sync'];
      if (!allowedPlugins.includes(pluginId)) {
        socket.emit('error', { message: `Unknown plugin: ${pluginId}` });
        return;
      }

      // Must be in the room to activate plugins
      if ((socket.data as SocketData).currentRoomId !== roomId) {
        socket.emit('error', { message: 'Must be in the room to activate plugins' });
        return;
      }

      const state = PluginService.activate(roomId, pluginId, character.id, {
        controllerId: character.id,
      });

      // Broadcast to everyone in the room that a plugin was activated
      const roomKey = `room:${roomId}`;
      io.to(roomKey).emit('plugin:activated', { roomId, pluginId, state });
      logger.info(`Plugin "${pluginId}" activated by ${character.nickname} in room ${roomId}`);
    });

    // Deactivate a plugin in a room
    socket.on('plugin:deactivate', (data: { roomId: string; pluginId: string }) => {
      if (!character) return;
      const roomId = String(data?.roomId ?? '');
      const pluginId = String(data?.pluginId ?? '');
      if (!/^\d+$/.test(roomId) || !pluginId) return;

      const existed = PluginService.deactivate(roomId, pluginId);
      if (existed) {
        const roomKey = `room:${roomId}`;
        io.to(roomKey).emit('plugin:deactivated', { roomId, pluginId });
        logger.info(`Plugin "${pluginId}" deactivated in room ${roomId}`);
      }
    });

    // Sync plugin state (controller sends state update, server broadcasts)
    socket.on('plugin:state-sync', (data: { roomId: string; pluginId: string; state: Record<string, unknown> }) => {
      if (!character) return;
      const roomId = String(data?.roomId ?? '');
      const pluginId = String(data?.pluginId ?? '');
      if (!/^\d+$/.test(roomId) || !pluginId || !data?.state) return;

      // Only the controller (activator) or room owner can send state updates
      const current = PluginService.getState(roomId, pluginId);
      if (!current) return; // plugin not active
      // Allow controller or any room member to update (MVP: trust all members)

      const updatedState = PluginService.updateState(roomId, pluginId, data.state);
      if (updatedState) {
        const roomKey = `room:${roomId}`;
        // Broadcast to EVERYONE in the room (including sender) so all clients
        // stay in sync through the same code path.
        io.to(roomKey).emit('plugin:state', { roomId, pluginId, state: updatedState });
      }
    });

    // ---- Friend system events ----
    // Real-time friend notifications. The REST API in routes/friends.ts is
    // the primary path for requests/accept/reject/remove; the socket path
    // exists to deliver in-page notifications + handle teleport (which needs
    // chunk-room switching, like player:move does).

    // Client explicitly asks for its current friend state (list + pending
    // requests). Sent by the friend panel when it opens.
    socket.on('friend:request-state', async () => {
      if (!character) return;
      try {
        const friends = await FriendService.getFriendList(character.id);
        const requests = await FriendService.getPendingRequests(character.id);
        socket.emit('friend:state', { friends, requests });
      } catch (error: any) {
        logger.error('Friend state error', error);
        socket.emit('error', { message: error.message || 'Failed to load friend state' });
      }
    });

    // Send a friend request (socket path — notifies the target in real time)
    socket.on('friend:send-request', async (data: { characterId: string }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      try {
        const result = await FriendService.sendRequest(character.id, String(data?.characterId ?? ''));
        socket.emit('friend:request-sent', {
          requestId: result.requestId,
          toCharacterId: String(data?.characterId),
          toNickname: result.toNickname,
        });
        // Notify the target if they are online
        const targetSocket = getSocketForCharacter(io, String(data?.characterId));
        if (targetSocket) {
          targetSocket.emit('friend:request-received', {
            requestId: result.requestId,
            fromCharacterId: character.id,
            fromNickname: character.nickname,
          });
        }
      } catch (error: any) {
        logger.error('Friend request error', error);
        socket.emit('error', { message: error.message || 'Failed to send friend request' });
      }
    });

    // Accept a friend request (socket path — notifies the requester in real time)
    socket.on('friend:accept-request', async (data: { requestId: number }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      try {
        const result = await FriendService.acceptRequest(Number(data?.requestId), character.id);
        socket.emit('friend:accepted', {
          friendCharacterId: result.friendCharacterId,
          friendNickname: result.friendNickname,
        });
        // Notify the original requester if they are online
        const requesterSocket = getSocketForCharacter(io, result.friendCharacterId);
        if (requesterSocket) {
          requesterSocket.emit('friend:accepted', {
            friendCharacterId: character.id,
            friendNickname: character.nickname,
          });
        }
      } catch (error: any) {
        logger.error('Friend accept error', error);
        socket.emit('error', { message: error.message || 'Failed to accept friend request' });
      }
    });

    // Reject a friend request (socket path)
    socket.on('friend:reject-request', async (data: { requestId: number }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      try {
        await FriendService.rejectRequest(Number(data?.requestId), character.id);
        socket.emit('friend:rejected', { requestId: Number(data?.requestId) });
      } catch (error: any) {
        logger.error('Friend reject error', error);
        socket.emit('error', { message: error.message || 'Failed to reject friend request' });
      }
    });

    // Remove a friend (socket path — notifies the other side in real time)
    socket.on('friend:remove', async (data: { characterId: string }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      const friendCharacterId = String(data?.characterId ?? '');
      try {
        await FriendService.removeFriend(character.id, friendCharacterId);
        socket.emit('friend:removed', { characterId: friendCharacterId });
        const friendSocket = getSocketForCharacter(io, friendCharacterId);
        if (friendSocket) {
          friendSocket.emit('friend:removed', { characterId: character.id });
        }
      } catch (error: any) {
        logger.error('Friend remove error', error);
        socket.emit('error', { message: error.message || 'Failed to remove friend' });
      }
    });

    // Teleport to a friend's location. Server-side authoritative teleport:
    // validates friendship + cooldown, moves the player, switches the
    // chunk room, and notifies both chunks (mirrors the player:move logic).
    socket.on('friend:teleport', async (data: { characterId: string }) => {
      if (!character) {
        socket.emit('error', { message: 'No character found' });
        return;
      }
      const friendCharacterId = String(data?.characterId ?? '');
      try {
        const target = await FriendService.teleportToFriend(character.id, friendCharacterId);

        const oldChunkId = character.chunkId;
        const chunkChanged = oldChunkId !== target.chunkId;

        if (chunkChanged) {
          // Leave old chunk room + notify old chunk
          socket.leave(oldChunkId);
          socket.to(oldChunkId).emit('player:leave-chunk', { characterId: character.id });

          // Join new chunk room
          socket.join(target.chunkId);
          character.chunkId = target.chunkId;

          logger.info(
            `${character.nickname} teleported from chunk ${oldChunkId} to ${target.chunkId}`
          );

          // Explore the destination chunk area (fog of war)
          const newlyExplored = await ExplorationService.exploreArea(character.id, target.chunkId, 1);
          if (newlyExplored.length > 0) {
            socket.emit('map:explore', { chunks: newlyExplored });
          }

          // Get players in new chunk
          const playersInNewChunk = await MovementService.getPlayersInChunk(target.chunkId);
          const otherPlayers = playersInNewChunk.filter(p => p.characterId !== character.id);
          socket.emit('players:in-chunk', {
            players: otherPlayers.map(p => ({
              characterId: p.characterId,
              nickname: p.nickname,
              position: p.position,
            })),
          });

          // Notify new chunk that this player entered
          socket.to(target.chunkId).emit('player:enter-chunk', {
            characterId: character.id,
            nickname: character.nickname,
            position: target.position,
          });
        }

        // Confirm to the teleporting client
        socket.emit('friend:teleport-confirmed', {
          characterId: friendCharacterId,
          nickname: target.nickname,
          position: target.position,
          chunkId: target.chunkId,
        });
      } catch (error: any) {
        logger.error('Friend teleport error', error);
        socket.emit('error', { message: error.message || 'Teleport failed' });
      }
    });

    // ---- Disconnect handler ----
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${user?.username} (${socket.id}), reason: ${reason}`);

      // Remove from the character→socket map
      if (character) {
        const sockets = characterSocketMap.get(character.id);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            characterSocketMap.delete(character.id);
          }
        }
      }

      // Stop the Redis position-cache refresher for this socket
      const timer = (socket.data as SocketData).cacheRefreshTimer;
      if (timer) clearInterval(timer);

      // Notify chunk that player left
      if (character) {
        socket.to(character.chunkId).emit('player:leave-chunk', {
          characterId: character.id,
        });

        // If the player was inside a chat room, refresh that room's member list
        const roomId = (socket.data as SocketData).currentRoomId;
        if (roomId) {
          const roomKey = `room:${roomId}`;
          getRoomMembers(io, roomKey)
            .then((members) => io.to(roomKey).emit('room:members', { roomId, members }))
            .catch((err) => logger.error('Failed to update room members on disconnect', err));
        }
      }
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });

    // ---- Async connection setup (runs AFTER all handlers are registered) ----
    // Join character's chunk room
    if (character) {
      socket.join(character.chunkId);
      logger.info(`${character.nickname} joined chunk room: ${character.chunkId}`);

      // Register this socket so friend notifications can reach this character
      // even from another chunk.
      const existing = characterSocketMap.get(character.id);
      if (existing) {
        existing.add(socket.id);
      } else {
        characterSocketMap.set(character.id, new Set([socket.id]));
      }

      // Get current position and ensure it's cached in Redis so other players
      // in this chunk can discover this player (a player who has never moved
      // has no Redis entry and would otherwise be invisible to new joiners).
      const currentPosition = await MovementService.ensurePlayerCached(character.id);

      // Keep the player's Redis position fresh while this socket stays connected.
      // The cache has a 5-minute TTL, so an idle (never-moving) connected user
      // would otherwise drop out of `getPlayersInChunk` and become invisible to
      // newly joining players. Refresh periodically to guarantee a connected
      // player is always discoverable.
      const cacheRefresh = setInterval(() => {
        MovementService.ensurePlayerCached(character.id).catch((err) =>
          logger.error('Failed to refresh player cache', err)
        );
      }, 120_000); // every 2 minutes (well under the 5-min TTL)
      socket.data.cacheRefreshTimer = cacheRefresh;

      // 首次连接即探索出生区块 5x5 范围（GDD 2.6 初始视野），并把整份已探索列表发给客户端（迷雾初始化）
      await ExplorationService.exploreArea(character.id, character.chunkId, 2);
      const explored = await ExplorationService.getExploredChunks(character.id);
      socket.emit('map:initial-explored', { chunks: explored });

      // Notify others in chunk that this player entered.
      // (Sending the list of *existing* players back to this socket is deferred
      // until it explicitly asks via 'client:request-chunk-players' above, so we
      // never race against this client's own listener registration.)
      socket.to(character.chunkId).emit('player:enter-chunk', {
        characterId: character.id,
        nickname: character.nickname,
        position: currentPosition?.position || { x: 0, y: 0 },
      });
    }
  });

  return io;
};
