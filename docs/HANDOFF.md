# Reifuu Room — 项目移交文件（HANDOFF）

> 本文件用于**当前团队 → 下一个团队**的工作交接。它记录项目当前真实状态、已完成/进行中/待办工作、团队结构、运行方式与已知问题。
> 下一个团队接手时，请先通读本文件 + `docs/GDD.md`，再检查代码现状。
> 最后更新：2026-09-04

---

## 1. 项目概述

**Reifuu Room**（reifuu-chat）：一款等距 3/4 视角（isometric）的二次元像素中世纪风**多人在线聊天游戏**。

| 项 | 值 |
|---|---|
| 客户端 | Vue 3 + TypeScript + Pinia + Phaser 3 (`client/reifuu-chat`) |
| 服务端 | Node.js + Express + TypeScript + Socket.io (`server`) |
| 数据库 | MySQL (mysql2/promise) |
| 缓存/会话 | Redis (node-redis v4+) |
| 实时通讯 | Socket.io WebSocket |

**核心玩法（见 GDD）**：用户注册/登录 → 创建角色（选出生大洲/外观）→ 在分区块的等距世界里移动/探索 → 采集资源（木/石/矿）→ 建造聊天室 → 进入聊天室实时文字聊天 → 多人实时可见/移动同步 → 视野迷雾（Phase 2 已完成）。

---

## 2. 团队结构（重建前）

| 角色 | 名称 | 主要负责 |
|---|---|---|
| lead | Cowork | 任务分解、协调、汇总 |
| teammate | 游戏策划师 | 设计文档、数值/机制 |
| teammate | 后端开发 | Node/Express/DB/socket |
| teammate | 前端开发 | Vue/Phaser 前端 |

> UI/UX 设计师已移除。下一个团队可自行决定是否需要重建。

---

## 3. 如何运行

### 3.1 依赖
项目根目录**没有**根 package.json，`client/reifuu-chat` 与 `server` 各自独立。

### 3.2 后端 (`server/`)
```bash
cd /c/Users/13205/Desktop/reifuu-room/server
npm install
npm run dev        # nodemon --exec tsx src/index.ts，端口 3000
```
- `.env` 中数据库凭证（**已包含**）：DB_HOST=192.168.12.1、DB_USER=reifuu-chat、DB_PASSWORD=`e52Bn6spjiWLszMD`、DB_DATABASE=`reifuu-chat`（注意数据库名是带连字符的 `reifuu-chat`）。
- Redis：192.168.12.1:6379，密码 `BSO1005CFXL`，db=1，key 前缀 `reifuu:`。
- 数据库表初始化：可执行 `server/src/db/schema.sql`（含最新 `explored_chunks` 表）或运行 `tsx src/init-db.ts`。

> 注意：后端服务常因端口占用/进程残留/长跑崩溃而"没起来"，此时前端登录会一直转圈。遇到「登录卡加载中」先检查 `netstat -ano | grep :3000` 是否监听，并重启后端。**务必从 `server/` 目录运行**（根目录无 package.json）。

### 3.3 前端 (`client/reifuu-chat/`)
```bash
cd /c/Users/13205/Desktop/reifuu-room/client/reifuu-chat
npm install
npm run dev        # Vite，端口 5173
```
- 环境变量：`VITE_API_BASE_URL` / `VITE_WS_URL` = `http://localhost:3000`。

---

## 4. 已完成的工作（Phase 0/1 + Phase 2 基础）

### 4.1 登录 / 注册 / 角色创建
- 认证：JWT（access + refresh），`server/src/routes/auth.ts`、`server/src/services/AuthService.ts`、`server/src/middleware/auth.ts`。
- 角色：`GET /character/me`（存在性检查，带 Redis 缓存）、`POST /character/create`（一人一角色，昵称唯一，出生点写**世界坐标**）。
- 坐标系约定：每区块 32x32 格，`世界坐标 = chunkX*32 + gridX`。默认出生点在区块 `10_10` 的 (325, 325)。
- 出生点选择系统（✅ 已完成，见 §4.7）：创建角色时可选「随机无主地块」或「随机公开地块」。
- 前端：`AuthView.vue`、`CharacterCreateView.vue`（含出生点选择卡片）、`stores/user.ts`、`stores/character.ts`、`App.vue`。

### 4.2 多人位置同步（已完成）
- 服务端 `MovementService`（Redis 缓存玩家位置，`player:move` 处理，跨区块切房间）+ `socket.ts`。
- 前端 `WorldScene` 用 `OtherPlayerSprite` 渲染其他玩家，事件：`players:in-chunk` / `player:enter-chunk` / `players:position-update` / `player:leave-chunk`。
- **已修复**：同区块玩家互相可见 + 一起移动（见 §7 修复记录）。

### 4.3 资源采集（已完成 ✅ 端到端）
- `server/src/services/ResourceService.ts`：区块内程序生成资源节点（木/石/矿），采集进背包，周期重生。
- 表：`resource_nodes`、`inventory_items`（**已在实际数据库中建好**）。
- REST（`server/src/routes/resource.ts`，均需 Bearer token）：
  - `GET /resource/chunk/:chunkId`：列出区块资源节点（首次访问自动生成 3-5 木 / 2-4 石 / 1-2 矿）。
  - `POST /resource/collect`：`{ nodeId, position: {x, y} }`，校验距离 ≤ 2 格与未耗尽。
  - `GET /resource/inventory`：当前角色背包。
- socket：`resource:collect`（C→S，`{ nodeId, x, y }`）→ 采集者收 `resource:collected` `{ nodeId, resourceType, inventory }`，同区块其他人收 `resource:node-depleted` `{ nodeId }`（`socket.to` 不含采集者本人，采集者需本地自标耗尽）。
- 重生：`index.ts` 每 60s 跑 `ResourceService.respawnResources()`（木 5min / 石 10min / 矿 30min）。
- 前端：`WorldScene` 渲染节点精灵（可点击采集）、`GameView` 背包面板、`stores/inventory.ts`。

### 4.4 建造系统（已完成 ✅ 端到端）
- `server/src/services/BuildService.ts`：用资源在区块上建造聊天室（`wooden_house` 20木 / `stone_house` 15石+5木 / `advanced_house` 10石+10木+5矿）。
- 表：`map_chunks`、`chat_rooms`。含公开/私有、每玩家 10 区块上限。
- REST（`server/src/routes/build.ts`，均需 Bearer token）：
  - `GET /build/templates`：建造模板与消耗。
  - `POST /build/chatroom`：`{ chunkId, template, roomName }`，校验模板/所有权上限/区块未占用/资源充足，成功扣资源并返回 `{ chatRoomId }`。
  - `GET /build/my-chunks`：我的领地列表。
  - `POST /build/visibility`：`{ chunkId, isPublic }` 切换区块公开/私有（需所有权）。
  - `GET /map/rooms-in-chunk/:chunkId`（在 `routes/map.ts`）：查区块内聊天室。
- 前端：`GameView` 建造面板（选模板 + 命名 + 材料核对 + 我的领地列表）。

### 4.5 视野迷雾系统（Phase 2，✅ 已全部完成）
见 §5。

### 4.6 聊天室实时聊天（Phase 4 核心功能，✅ 已全部完成）
见 §6。

### 4.7 出生点选择系统（✅ 已完成，GDD §2.1）
见 §7。

---

## 5. ⭐ 视野迷雾系统（Phase 2，✅ 前后端均已完成）

**任务状态**：已完成。后端与前端迷雾渲染、小地图均已实现并端到端可用。

### 5.1 后端（已完成 ✅）
- 表 `explored_chunks (character_id, chunk_id, explored_at, UNIQUE(character_id,chunk_id))`。
  - 已加入 `server/src/db/schema.sql`，且**已在实际数据库中建好**。
- 服务 `server/src/services/ExplorationService.ts`：
  - `exploreArea(characterId, chunkId)`：探索以 chunkId 为中心的 **3x3** 区块，`INSERT IGNORE` 幂等，返回**新解锁**的区块列表。
  - `getExploredChunks(characterId)`：返回全部已探索区块 ID。
- REST `server/src/routes/map.ts` → **`GET /map/explored`**（需 Bearer token），返回 `{ chunks: string[] }`。已挂载于 `index.ts` 的 `/map`。
- socket 事件（`server/src/socket.ts`）：
  - 连接时自动探索出生点 3x3，下发 **`map:initial-explored`** `{ chunks: string[] }`。
  - 移动**跨区块**时探索新区块 3x3，仅推送新解锁的 **`map:explore`** `{ chunks: string[] }`（同一区块内移动不触发）。

### 5.2 前端（✅ 已完成）
- `WorldScene` 迷雾遮罩层：`buildFogOverlay` / `setChunkFog` / `refreshFog`。
  - 未探索区块 = 完全不渲染（场景背景即"虚空"）。
  - 已探索但不当前可视 = 半透明灰白遮罩（"记忆中的地图"）。
  - 当前可视（玩家周围 5x5） = 正常彩色。
- socket 事件：`src/game/EventBus.ts` 已添加 `map:initial-explored` / `map:explore` 签名；`src/game/network/SocketClient.ts` 已转发到 EventBus。
- Pinia `exploration` store：管理已探索集合 + `computeVisibleChunks` 计算当前可视范围。
- 小地图 `Minimap.vue`：已探索区域缩略图，未探索显示迷雾。

> 视野口径：服务端 `socket.ts` 用 `exploreArea(character.id, character.chunkId, 2)` = **5x5**，与 GDD 2.6 一致（§8 的 3x3 口径已统一为 5x5）。

### 5.3 验证方式
```bash
# 1) 看后端探索接口
curl -H "Authorization: Bearer <token>" http://localhost:3000/map/explored
# 2) socket 初始 + 增量探索事件（client 目录下用 socket.io-client）
#    监听 map:initial-explored / map:explore / player:move-confirmed
```

---

## 6. ⭐ 聊天室实时聊天（Phase 4 核心，✅ 前后端均已完成）

**任务状态**：已完成。聊天室从"只能建造"升级为"可进入、可实时文字聊天"，端到端验证通过（REST + socket + 浏览器 UI）。

### 6.1 后端（已完成 ✅）
- 表 `chat_messages (id, room_id, character_id, content, created_at)`，FK 到 `chat_rooms` 与 `characters`。已加入 `schema.sql` 并**已在实际数据库建好**（`npm run init-db`）。
- 服务 `server/src/services/ChatMessageService.ts`：
  - `sendMessage(roomId, characterId, content)`：校验内容非空且 ≤500 字、房间存在，插入后 JOIN 角色昵称返回完整行。
  - `getHistory(roomId)`：最近 100 条，按时间正序返回。
- REST `server/src/routes/chat.ts`（挂载于 `index.ts` 的 `/chat`，均需认证）：
  - `POST /chat/:roomId/messages`：`{ content }` → 返回完整消息行（含 nickname）。
  - `GET /chat/:roomId/messages`：历史消息。
  - `GET /chat/room/:roomId`：房间详情。
- socket 事件（`server/src/socket.ts`，用 Socket.io 房间 `room:<id>` 广播）：
  - `room:join`（C→S，`{ roomId }`）→ 加入者收 `room:history` + `room:members`，房间内其他人收更新后的 `room:members`。
  - `room:leave`（C→S，`{ roomId }`）→ 离开并广播更新后的成员列表。
  - `room:message`（C→S，`{ roomId, content }`）→ 持久化后向房间广播 `room:message`。
  - 断线时自动清理 `currentRoomId` 并刷新成员列表。

### 6.2 前端（✅ 已完成）
- `stores/room.ts`：完整聊天 store —— `enterRoom`（REST 拉历史 + socket join）、`leaveRoom`、`applyHistory`、`applyMessage`（按 id 去重）、`applyMembers`、`sendMessage`。角色逻辑：`ownerId === characterId` 为房主，否则访客。
- `components/game/HUD/ChatPanel.vue`：房间聊天 UI（标题 + 角色 + 离开按钮、成员条、可滚动消息列表、输入框回车发送）。
- `WorldScene`：`loadChunkRooms`（REST `/map/rooms-in-chunk`）+ `renderRoomMarker`（房屋精灵摆区块中央，可点击）+ `onRoomMarkerClick`（发 `ui:enter-room`）。房屋贴图由 `PreloadScene.generateHouseTextures()` 生成（wooden/stone/advanced 三种）。
- `GameView.vue`：监听 `ui:enter-room` → `roomStore.enterRoom()`，`v-if="roomStore.inRoom"` 显示 ChatPanel。
- socket 事件：`SocketClient.ts` 与 `EventBus.ts` 已添加 `room:history` / `room:message` / `room:members`（S→C）与 `room:join` / `room:leave` / `room:message`（C→S）。

### 6.3 验证方式
- REST：登录拿 token 后 `GET /chat/:roomId/messages`、`POST /chat/:roomId/messages`。
- socket：两个客户端（player_a / player_b）先后 join 同一房间，A 发消息 B 能收到，成员列表广播正确，消息持久化到 DB。
- 浏览器：登录 → 点击区块中央房屋标记 → ChatPanel 打开 → 输入回车发送 → 消息上屏并落库。

---

## 7. ⭐ 出生点选择系统（GDD §2.1，✅ 前后端均已完成）

**任务状态**：已完成。角色创建时可选择出生方式：随机无主地块、随机公开地块（按人口排序）。端到端 E2E 测试 16/16 通过。

### 7.1 后端（已完成 ✅）
- **DB 迁移**：`characters` 表新增 `spawn_method VARCHAR(30) NULL` 列（`server/add_spawn_method.sql`），已有角色回填为 `'default'`。`schema.sql` 同步更新。
- **服务 `server/src/services/SpawnPointService.ts`**：
  - `getUnownedPool()`：生成 0,0–20,20 的候选区块网格（441 块），排除已在 `map_chunks` 中被占用（有 owner 或为 chatroom）的区块，返回可用候选列表。Redis 缓存 10s TTL。
  - `getPublicPool()`：查 `map_chunks WHERE owner_id IS NOT NULL AND is_public = true`，按该区块角色数（`characters.current_chunk_id`）降序、`updated_at` 降序排列，LIMIT 20。Redis 缓存 10s TTL。
  - `selectSpawnPoint(method)`：从对应池中随机选一个区块，并通过 Redis Set `spawn:selected`（300s TTL）排除最近 5 分钟内已分配的区块，避免连续创建角色挤在同一区块。选定后计算世界坐标 = `chunkX*32+5, chunkY*32+5`。
  - `getSpawnOptions()`：返回两种出生方式的 DTO（含池大小预览），供前端展示。
  - `invalidatePools()`：清空 Redis 缓存池。BuildService 在建造/公开切换后 fire-and-forget 调用，确保缓存及时刷新。
- **CharacterService**：`createCharacter` 新增可选 `spawnMethod` 参数。传入时用 SpawnPointService 分配出生点；不传时向后兼容走默认 `10_10`。`spawn_method` 写入 DB 并在 DTO 中返回。`getCharacterByUserId` 同样查询并返回 `spawn_method`。
- **REST（`server/src/routes/character.ts`）**：
  - `GET /character/spawn-options`（需认证）→ `SpawnOptionDTO[]`，含 `method`、`label`、`poolSize`、`description`。
  - `POST /character/create` 请求体新增可选 `spawnMethod` 字段（`'random_unowned'` | `'random_public'`）。
- **BuildService 集成**：建造聊天室成功后、切换区块公开/私有后，均 fire-and-forget 调 `SpawnPointService.invalidatePools()`（catch + warn，不阻塞主流程）。

### 7.2 前端（✅ 已完成）
- **类型**（`api/types.ts`）：新增 `SpawnMethod` 类型、`SpawnOptionDTO` 接口；`CharacterDTO` 新增 `spawnMethod` 字段。
- **Store**（`stores/character.ts`）：新增 `spawnMethod` 状态、`fetchSpawnOptions()` action（GET /character/spawn-options）、`createCharacter` payload 支持 `spawnMethod`。
- **UI**（`CharacterCreateView.vue`）：大洲选择之后新增两张出生方式卡片（随机无主 / 随机公开），显示池大小与描述，可点击选择。预览框显示已选出生方式。`onMounted` 自动加载选项。

### 7.3 验证方式
- E2E 测试脚本（临时，已清理）：注册新用户 → GET spawn-options → POST create(random_unowned) → 验证非 10_10 且坐标正确 → 第二用户同样 random_unowned → 验证区块不同（recently-selected 排除）→ GET /character/me 验证 spawnMethod → 无效 method 返回 400 → 无 spawnMethod 向后兼容 10_10 → random_public 空池返回 404 友好提示。
- 16/16 全部通过（2026-09-04）。

### 7.4 注意事项
- `random_public` 依赖 `map_chunks.is_public = true`，而 BuildService 建造时默认 `is_public = FALSE`。需玩家主动调用 `POST /build/visibility { isPublic: true }` 后才有公开地块可选。空池时返回 404 + 友好提示。
- 无主池范围固定 0–20，若世界扩展超过此范围需调整候选网格或改用动态扫描。
- ~~邀请制出生~~ 尚未实现（Phase 3），当前仅两种 GDD §2.1 规定的出生方式。

---

## 8. ⭐ 好友系统（GDD §2.7，✅ 前后端均已完成）

**任务状态**：已完成。支持好友申请（附留言）、接受/拒绝、好友列表（在线状态）、删除好友、信箱（好友申请/系统消息）、未读数、**好友传送**（5 分钟冷却）、**好友私聊频道**、**飞鸽传书**（跨区块延迟留言）。端到端 E2E 测试：好友核心 37/37 + 好友传送 25/25 + 好友私聊 24/24 + 飞鸽传书 37/37 全通过（2026-09-04）。

### 8.1 数据库
- **迁移脚本 `server/add_friend_system.sql`**（已执行）：3 张新表，`schema.sql` 同步更新：
  - `friendships`：双向存储（id1 < id2 保证唯一），`character_id_1/2` 外键 CASCADE。
  - `friend_requests`：`status ENUM('pending','accepted','rejected')`、`message VARCHAR(200)`（申请附言）、`responded_at`。无 pair 唯一约束 → 被拒后可重新申请。
  - `messages`（信箱）：`receiver_id`、`sender_id`（系统消息为 NULL）、`type ENUM('friend_request','system','chat','pigeon')`、`content JSON`、`is_read`。
- ⚠️ 若旧库已存在 `friend_requests` 但缺 `message` 列（早期迁移版本），需手动 `ALTER TABLE friend_requests ADD COLUMN message VARCHAR(200) NULL AFTER status`（本次交接已踩坑：CREATE TABLE IF NOT EXISTS 不会补列）。
- **飞鸽传书迁移 `server/add_pigeon_system.sql`**（已执行）：`pigeon_messages` 表（延迟投递队列）+ `messages.type` ENUM 扩展 `'pigeon'` + `characters.reject_stranger_pigeon`（隐私设置，MySQL 5.7 需手动 `ALTER TABLE characters ADD COLUMN reject_stranger_pigeon BOOLEAN DEFAULT FALSE`）。
  - ⚠️ 若旧库已存在 `pigeon_messages` 但为早期草案结构（`from_character_id`/`to_character_id`/`deliver_at`），需先 `DROP TABLE pigeon_messages` 再重跑迁移（本次交接已踩坑：CREATE TABLE IF NOT EXISTS 不会改列）。

### 8.2 后端
- **服务 `server/src/services/FriendService.ts`**：
  - `sendFriendRequest(from, to, message)`：校验非自己、目标存在、非好友、无 pending 申请（双向检查）、好友上限 50。成功后：写 `friend_requests` + 给收件人写信箱消息（`friend_request` 类型，JSON content 含 from 昵称/留言）。
  - `respondToRequest(requestId, characterId, accept)`：仅收件人可操作（403）；accept → 双向插入 `friendships` + 请求标记 accepted + 给申请人写系统信箱消息；reject → 仅更新请求状态。重复响应 409。
  - `getFriends(characterId)`：查双向好友，Redis Set `online:characters` 判断在线（node-redis v4+ 的 `sIsMember` 返回数字需 `Boolean()` 包裹），在线优先排序。
  - `removeFriend`（好友不存在返回 404）、`getFriendCount`、`isFriend`。
  - 信箱：`getMailbox`（按时间倒序，含发送者昵称）、`markMessageRead`、`getUnreadCount`、`createMailboxMessage`。
  - 飞鸽传书：`sendPigeonMessage`/`processDuePigeonMessages`/`getPigeonMessages`/`getPigeonSettings`/`updatePigeonSettings`（详见 §8.6）。投递定时任务在 `server/src/index.ts`：**每 10 秒** `setInterval` 调 `processDuePigeonMessages()`，对每条到期消息 `io.to('character:{receiverId}').emit('friend:pigeon-delivered', ...)`。
- **REST `server/src/routes/friend.ts`**（挂载于 `/friend`，全部需 authenticate + requireCharacter）：
  - `GET /friend/list`、`DELETE /friend/:characterId`、`POST /friend/request`、`POST /friend/request/:requestId/respond`、`GET /friend/requests/pending`、`GET /friend/mailbox`、`POST /friend/mailbox/:messageId/read`、`GET /friend/mailbox/unread-count`。
- **Socket（`server/src/socket.ts`）**：
  - 新增 `friend:send-request` / `friend:respond` / `friend:teleport` 事件（同步注册在异步 setup 之前，避免 handler 注册竞态——同 §10.2 教训）。
  - 每个连接加入房间 `character:{characterId}` → 按角色精确推送。
  - 连接时 `setCharacterOnline` + 通知在线好友 `friend:online-status`；断开时 `setCharacterOffline` + 通知。
  - 客户端事件：`friend:new-request`、`friend:request-result`、`friend:responded`、`friend:online-status`、`friend:teleport-confirmed`。

### 8.3 前端
- **类型/Store**：`api/types.ts` 新增 `FriendDTO`/`FriendRequestDTO`/`MailboxMessageDTO`；`http.ts` 新增 `apiDelete`；`stores/friend.ts` Pinia store 封装全部 friend API + 在线状态更新。
- **组件**（`components/game/HUD/`）：
  - `FriendListPanel.vue`：好友列表（在线绿点/离线灰点、在线优先排序、删除按钮、实时在线状态更新）。
  - `MailboxPanel.vue`：信箱（全部/好友申请/系统消息 tab、好友申请直接接受/拒绝、标记已读）。
  - `PlayerInfoCard.vue`：点击其他玩家弹出的信息卡（昵称 + 「加好友」带可选留言）。
- **交互入口**：`OtherPlayerSprite` 设为可点击（`setInteractive` + pointerdown → `ui:show-player-info` 事件携带 characterId/nickname）；`GameView.vue` HUD 加「好友」/「信箱」按钮（信箱带未读红点角标）。

### 8.4 好友传送（GDD §2.7 好友传送，✅ 已完成）
- **服务 `FriendService.teleportToFriend(characterId, friendCharacterId)`** 校验链：好友关系(404) → 好友在线(400，Redis Set `online:characters`) → 冷却(429，Redis key `teleport:cooldown:{characterId}` TTL 300s)。通过后：`MovementService.getPlayerPosition` 取好友位置 → 随机偏移 1-2 格落点（角度随机、避免完全重叠）→ `getChunkId` 算目标区块 → `updatePositionAfterTeleport` 同步写 DB+Redis → `ExplorationService.exploreArea(cid, chunk, 1)` 自动探索 → 写冷却 key。返回 `{ position, chunkId, friendNickname, cooldownRemaining }`。
- **`MovementService.updatePositionAfterTeleport`**（新增方法）：绕过 `MAX_MOVE_DISTANCE=10` 校验（普通移动路径不适用），**同步**更新 `characters` 表 + `player:{id}:position` Redis 缓存 + **失效 `character:user:{userId}` 角色缓存**（否则 `/character/me` 返回旧位置 5 分钟——缓存自延续陷阱，同 §10.2.4）。
- **REST**：`POST /friend/teleport/:characterId`。
- **Socket**：`friend:teleport` handler 在服务层校验通过后处理区块切换（leave 旧区块 room + `player:leave-chunk`、join 新区块 + `player:enter-chunk`、探索迷雾 `map:explore`、下发 `players:in-chunk`），最后 `friend:teleport-confirmed` 确认。
- **前端**：`FriendListPanel.vue` 在线好友显示「传送」按钮 → `ui:teleport-friend` 事件 → `GameView` 转发 socket `friend:teleport` → `WorldScene.onTeleportConfirmed` 更新玩家精灵位置/区块/迷雾 + `game:toast` 提示。
- **验证**：E2E 25/25 通过 —— 非好友(404)/好友离线(400)/建好友/传送成功(位置+chunk+好友昵称+cooldown)/DB 位置更新/冷却期 429/socket 传送冷却报错/清冷却后 socket 传送成功/落点不重叠且距离≤2.83/冷却 key TTL=300。

### 8.5 好友私聊频道（GDD §2.7 私聊，✅ 已完成）
- **服务 `FriendService`**（“好友私聊（GDD §2.7）”小节）：
  - `sendPrivateMessage(fromCharacterId, toCharacterId, content)`：校验非空/trim ≤200 字(400) → 好友关系(404) → 取发送者昵称 → 写 `messages`（`type='chat'`，`content JSON {text}`）→ 返回 `{id, senderId, receiverId, content, createdAt}`。
  - `getPrivateMessages(characterId, friendCharacterId)`：双向查询 `WHERE type='chat' AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))`，`ORDER BY m.created_at DESC, m.id DESC LIMIT 100`（**必须加 `m.id DESC` 兜底**，否则同秒消息排序不稳定），JS `.reverse()` 转正序返回，join 发送者昵称。
  - `markConversationRead(characterId, friendCharacterId)`：`UPDATE is_read=TRUE WHERE type='chat' AND receiver_id=me AND sender_id=friend`。
- **REST**：`GET /friend/messages/:characterId`（历史，正序）、`POST /friend/messages/:characterId/read`（标记已读）。
- **Socket**：`friend:send-message` handler → 服务层校验通过后 `io.to('character:'+targetId).emit('friend:message-received',{message})`（跨区块即时送达，复用 §8.2 的按角色房间）+ `socket.emit('friend:message-sent',{message})`；错误走 socket `error` 事件。
- **前端**：
  - `SocketClient.ts`/`EventBus.ts` 新增 `PrivateMessagePayload` 与 `friend:message-received`/`friend:message-sent`/`ui:open-private-chat`/`ui:close-private-chat` 事件。
  - `stores/friend.ts`：`privateMessages`/`privateChatFriendId`/`privateChatFriendNickname` 状态 + `fetchPrivateMessages`/`appendPrivateMessage`（按 id 去重，peerId 用 `message.senderId === myCharacterId ? receiverId : senderId` 解析，myCharacterId 来自 characterStore 需 `Number()`）/`markConversationRead`/`openPrivateChat`/`closePrivateChat`。
  - `PrivateChatPanel.vue`（新）：好友名 + 关闭、消息列表（自己/对方左右样式 + 时间）、输入框（Enter 发送、maxlength 200）、watch `privateChatFriendId`（immediate）拉历史 + 标记已读 + 滚动到底。
  - `FriendListPanel.vue` 好友行加「消息」按钮（离线也可发）→ `ui:open-private-chat`；`MailboxPanel.vue` 新增「好友消息」tab（`typeLabel` chat→好友消息）。
  - `GameView.vue`：注册/转发上述事件，收到 `friend:message-received` 时若非当前聊天窗口则 toast + 刷新未读数。
- **验证**：E2E 24/24 通过 —— 非好友(404)/空内容(400)/超长(400)/发送成功(DB 落库+content JSON)/历史正序/双向可见/标记已读(仅 receiver 侧 is_read)/socket 实时送达(跨区块)/socket 发送确认/发送者视角 is_read=false。

### 8.6 飞鸽传书（GDD §2.7 飞鸽传书，✅ 已完成）
- **服务 `FriendService`**（"飞鸽传书（GDD §2.7）"小节）：
  - `sendPigeonMessage(fromCharacterId, toCharacterId, content)`：校验内容非空/trim ≤200 字(400) → 非自己(400) → 接收者存在(404) → 隐私设置：非好友且接收者开启 `reject_stranger_pigeon` → 403（**好友不受该设置影响**）→ 冷却：5 分钟窗口内每发送者最多 3 条（查 `pigeon_messages` 计数）→ 超限 429。
  - 距离与延迟：`calculateChunkDistance`（**切比雪夫距离** `max(|dx|,|dy|)`，chunkId 格式 `x_y`）→ `calculatePigeonDelay`：distance≤1（同/相邻区块）→ **0 秒即时**；同大洲（|dx|,|dy| 都 ≤ 世界半径内同洲判定）→ 600 秒；跨大洲 → 1350 秒；`has_traffic_channel` 当前固定 false（交通工具系统未实现）。
  - **延迟缩放 `PIGEON_DELAY_SCALE` 环境变量**（默认 1）：**DB 存储未缩放 delaySeconds**（600/1350），扫描 SQL 用 `TIMESTAMPDIFF(SECOND, sent_at, NOW()) >= calculated_delay * delayScale` 比较；`sendPigeonMessage` 用 `round(delaySeconds * delayScale)` 判定即时送达（0）并回报客户端。测试用 `PIGEON_DELAY_SCALE=0.01`（600s→6s）。
  - 即时送达（缩放后=0）：直接写 `delivered_at=NOW()` + 写信箱 `messages`（`type='pigeon'`，`content JSON {text, pigeonId, senderNickname}`）+ 未读 +1，返回 `deliveredAt` 非空；否则 `delivered_at=NULL`（传递中），返回 `deliveredAt: null`。
  - `processDuePigeonMessages()`（定时投递，index.ts **每 10 秒** `setInterval` 调用）：扫描到期的消息 → 写 `delivered_at` + 写信箱 → 返回 `{pigeonId, receiverId, senderNickname, content}` 列表，index.ts 对每条 `io.to('character:'+receiverId).emit('friend:pigeon-delivered', {...})`（离线则下次登录看信箱）。
  - `getPigeonMessages(characterId)`：收到的飞鸽列表（`delivered_at IS NOT NULL`），带 senderNickname；`getPigeonSettings/updatePigeonSettings`：读写 `reject_stranger_pigeon`。
- **REST**（⚠️ Express 路由顺序陷阱）：`GET/POST /friend/pigeon/settings` 必须注册在 `POST /friend/pigeon/:characterId` **之前**，否则 `settings` 被当作 characterId 解析。另：`GET /friend/pigeon`（收件列表）。
- **前端**：
  - `types.ts`：`MailboxMessageType` += `'pigeon'`；`PigeonMessageDTO`、`PigeonSettingsDTO`。
  - `stores/friend.ts`：pigeon 状态 + `fetchPigeonMessages`/`fetchPigeonSettings`/`updatePigeonSettings`/`sendPigeonMessage`/`openPigeonCompose`/`closePigeonCompose`/`onPigeonDelivered`。⚠️ 服务端返回形状：发消息 → `{pigeon}`；列表 → `{pigeons}`；设置 → 直接返回对象（不包裹）。
  - `SocketClient.ts`/`EventBus.ts`：`friend:pigeon-delivered` socket 事件 + `ui:open-pigeon-compose`/`ui:close-pigeon-compose`。
  - `PigeonComposePanel.vue`（新）：撰写窗口（目标昵称、textarea ≤200、字数、发送、即时/延迟/错误反馈、`formatDelay` 显示预计送达时间）。
  - `MailboxPanel.vue` 飞鸽 tab + 回信按钮；`FriendListPanel.vue` 飞鸽按钮；`PlayerInfoCard.vue` 飞鸽传书按钮（**好友和陌生人都可发**）。
  - `GameView.vue`：注册 EventBus 转发、`friend:pigeon-delivered` → toast + 刷新信箱，onMounted 拉取飞鸽列表 + 设置。
- **验证**：E2E 37/37 通过 —— 内容校验（空/超长/自己/不存在）、同区块即时（DB delivered_at、信箱写入、未读+1、列表含 senderNickname、distance=0）、陌生人拒绝设置（403、好友不受影响）、冷却（429）、跨区块延迟投递 + 定时任务 + socket 通知（含 pigeonId/senderNickname/content）、设置关闭。

### 8.7 未实现（后续 Phase 3）
- 隐身模式、拉黑（Phase 5）。飞鸽传书 ✓ 已完成（§8.6）。

---

## 9. 测试账号（仍在数据库中）

| 账号 | 密码 | 角色 | 出生区块 | 世界坐标 |
|---|---|---|---|---|
| `player_a` | `test123456` | PlayerA | 10_10 | (325, 325) |
| `player_b` | `test123456` | PlayerB | 10_10 | (325, 325) |

其他遗留账号：`testuser`/Reifuu(10_10)、`testuser2`/TestHero(10_10)、`BSTluo`、`Reifuu`、`testuser123`、`newuser1788364161871`。
> 说明：同一区块多个角色坐标**完全相同**（同一出生点），属正常现象；后续可加出生点随机偏移。

---

## 10. 关键修复记录（重要背景，别再踩坑）

1. **世界观坐标 bug**：旧数据把区块内坐标当世界坐标存（(5,5) 而非 (325,325)），导致多人不在同一区块、互相看不见。已在 `CharacterService` 修复 + 用 `server/fix_character_positions.sql` / JS 脚本迁移存量。现存角色坐标已世界化。
2. **同区块玩家互相可见**：此前 `getPlayersInChunk` 只扫 Redis，而"从未移动"的玩家无 Redis 键 → 别人看不到他。修复：新增 `MovementService.ensurePlayerCached()`（连接时把 DB 位置写回 Redis）＋ `client:request-chunk-players` 握手（客户端注册完监听器后再请求名单，避免推送早于监听注册的竞态）。
   - **2026-09 深层根因修复（此前 §7.2 的握手方案并未真正生效）**：
     - **服务端 handler 注册竞态**：`io.on('connection')` 回调是 `async`，原代码把 `socket.on('client:request-chunk-players', …)` 注册在三个 `await` 之后。Socket.IO 服务端**不会缓冲**未注册 handler 的入站事件 → 客户端连接后立刻发的名单请求在异步 setup 完成前到达即被静默丢弃。修复：所有 `socket.on(...)` 同步注册在前，`await` 异步 setup（加房间、`ensurePlayerCached`、探索、enter-chunk 广播）挪到回调末尾（见 `server/src/socket.ts`）。
     - **Redis 位置缓存 5 分钟 TTL**：连接但一直不动的老玩家，其 `player:{id}:position` 键 300s 后过期 → 新进玩家看不到他。修复：连接后每 120s 调 `ensurePlayerCached` 刷新（`cacheRefreshTimer`，在 `disconnect` 时清理）。
     - **客户端 socket 时序兜底**：若 `WorldScene.create()` 时 socket 尚未建立（GameView onMounted 与 Phaser 场景启动的时序差）或断线重连，原代码既不注册 socket 监听也不发名单请求。修复：`create()` 立即调 `onSocketConnected()` 并订阅 `EventBus` 的 `socket:connected`（scene shutdown 时 `off`）；`onSocketConnected` 会补注册监听器（`syncHandlersRegistered` 防重）+ 补发 `client:request-chunk-players`。
     - **Redis 位置缓存的自延续陷阱**：`getPlayerPosition` 优先读 Redis，miss 才回 DB → 手改 DB 位置后 Redis 旧值会一直自我延续，测试时必须先清 `reifuu:player:*:position` 与 `character:user:{userId}` 两类缓存（E2E 验证时踩过：DB 已改 10_10，Redis 缓存还是 11_10 导致误判修复无效）。
3. **地图块类型不同步**：之前用 `Math.random()` 每端各自随机 → 地形不一致。修复：新增 `client/reifuu-chat/src/game/utils/rng.ts`（FNV-1a 哈希 + mulberry32 确定性 PRNG），`WorldScene.generateMap(chunkId)` 用 `chunkId` 做种子，同一区块所有玩家生成一致地形。
4. **登录卡加载 / 刷新才正常**：多为后端未运行（转圈）、或 token 持久化未验证即自动登入。相关：App.vue 的 loading 判定、401 处理、登录后 `loadCharacter`；CharacterCreateView 有「退出」按钮兜底。
5. **API 性能**：角色存在性检查已加 Redis 缓存（命中 ~15ms）+ MySQL 连接池调优（queueLimit/connectTimeout/maxIdle/idleTimeout + 每条查询 5s 超时）+ 慢查询日志。

前端 `vue-tsc --noEmit` 应能通过（若报类型错多为 rng/EventBus/SocketClient 签名，需随改动同步更新）。

---

## 11. 已知问题 / 待确认

- **初始视野范围口径已统一**：GDD 2.6 写 5x5，服务端已用 `exploreArea(..., 2)` = 5x5。若策划后续改口径，改 `server/src/socket.ts` 的半径。
- ~~前端迷雾完全未做~~（**已解决**，§5.2 完成）。
- 小地图、资源节点/建造/聊天室前端交互 UI（**已补齐**：`WorldScene` 资源节点渲染 + `GameView` 背包/建造面板）。
- 好友系统（✅ 已完成，见 §8）/ 交通工具系统 / 传送门系统仍未实现（GDD Phase 3/4）。
- 聊天室成员角色（房主/成员/访客）目前仅有房主 vs 访客二分，邀请制与成员管理未实现（见 §6.2）。
- 数据库 `192.168.12.1` 是内网地址，换环境/远程时需改 `.env`（曾有短暂不可达导致 500）。
- **表结构迁移注意**：`schema.sql` 用 `CREATE TABLE IF NOT EXISTS`，不会 ALTER 已存在的表。若在旧库上跑 schema，`map_chunks` / `resource_nodes` / `inventory_items` / `chat_rooms` 等新列需手动迁移或删表重建（本次交接中 `map_chunks` 因缺 `chunk_id/chunk_type/owner_id/is_public` 列已重建）。
- **`/auth/login` 字段名**是 `usernameOrEmail`（不是 `username`），`/auth/register` 才是 `username`。API 响应格式 `{ status, data }` 或 `{ status, message }`。

---

## 12. 下一步建议（给下个团队）

1. 先通读本文件 + `docs/GDD.md` + `docs/ART_STYLE_GUIDE.md`（此目录不是 git 仓库）。
2. ~~视野迷雾前端~~（**已完成** §5.2）。
3. ~~复核现有 API 的前端对接~~（**已完成**：资源采集/建造/背包/聊天室均已端到端联通并 REST 验证通过）。
4. ~~进入聊天室实际使用~~（**已完成** §6）：点击房屋标记 → 进入房间 → 实时文字聊天，前后端 + 浏览器 UI 均验证通过。
5. **聊天室进阶功能**：房间权限管理（成员角色/邀请制）、音乐/视频同步播放、房间装饰系统。
6. ~~好友系统核心~~（**已完成** §8）。Phase 3 剩余：好友传送（✅ 已完成）、好友私聊（✅ 已完成）、飞鸽传书（✅ 已完成 §8.6）、隐身模式、传送门。
7. 规划 Phase 4（交通工具）。
8. 建议为前端新增 UI/UX 专职成员补齐界面质感（该角色上一团队已移除）。
9. 前端接入正式美术资源时替换 `PreloadScene` 的 Graphics 生成贴图（贴图 key 不变即可平滑替换）。
