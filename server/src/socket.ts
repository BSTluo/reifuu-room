import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyAccessToken } from './utils/jwt.js';
import logger from './utils/logger.js';
import config from './config.js';
import CharacterService from './services/CharacterService.js';
import MovementService from './services/MovementService.js';
import ExplorationService from './services/ExplorationService.js';

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

    // Join character's chunk room
    if (character) {
      socket.join(character.chunkId);
      logger.info(`${character.nickname} joined chunk room: ${character.chunkId}`);

      // Get current position and ensure it's cached in Redis so other players
      // in this chunk can discover this player (a player who has never moved
      // has no Redis entry and would otherwise be invisible to new joiners).
      const currentPosition = await MovementService.ensurePlayerCached(character.id);

      // 首次连接即探索出生区块 5x5 范围（GDD 2.6 初始视野），并把整份已探索列表发给客户端（迷雾初始化）
      await ExplorationService.exploreArea(character.id, character.chunkId, 2);
      const explored = await ExplorationService.getExploredChunks(character.id);
      socket.emit('map:initial-explored', { chunks: explored });

      // Notify others in chunk that this player entered.
      // (Sending the list of *existing* players back to this socket is deferred
      // until it explicitly asks via 'client:request-chunk-players' below, so we
      // never race against this client's own listener registration.)
      socket.to(character.chunkId).emit('player:enter-chunk', {
        characterId: character.id,
        nickname: character.nickname,
        position: currentPosition?.position || { x: 0, y: 0 },
      });
    }

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

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${user?.username} (${socket.id}), reason: ${reason}`);

      // Notify chunk that player left
      if (character) {
        socket.to(character.chunkId).emit('player:leave-chunk', {
          characterId: character.id,
        });
      }
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  return io;
};
