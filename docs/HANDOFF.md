# Reifuu Room — 项目移交文件（HANDOFF）

> 本文件用于**当前团队 → 下一个团队**的工作交接。它记录项目当前真实状态、已完成/进行中/待办工作、团队结构、运行方式与已知问题。
> 下一个团队接手时，请先通读本文件 + `docs/GDD.md`，再检查代码现状。
> 最后更新：2026-09-05（交通工具系统 §6.13 追加）

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
- 坐标系约定：每区块 32x32 格，`世界坐标 = chunkX*32 + gridX`。出生点均在区块 `10_10` 的 (325, 325)。
- 前端：`AuthView.vue`、`CharacterCreateView.vue`、`stores/user.ts`、`stores/character.ts`、`App.vue`。

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

### 4.7 好友系统（Phase 3，✅ 已全部完成）
见 §6.7。

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

## 6.5 ⭐ 插件系统：音乐/视频同步播放（✅ 前后端均已完成）

**任务状态**：已完成。房间内插件架构 + 两个内建插件（一起听歌 / 一起看视频）端到端验证通过（REST + socket 多端同步 + 浏览器 UI）。

### 6.5.1 架构（GDD §2.5）
插件以"房间会话"形式存在，**不持久化**（内存中，房间清空即销毁）。每个房间每个 pluginId 最多一个活跃实例：
- **控制器模式**：谁激活插件谁就是 controller（`controllerId`），controller 负责播放/暂停/seek，其他成员只读跟随。
- **状态同步**：controller 定期（每 5s）+ 操作时向服务端发 `plugin:state-sync`，服务端 `Object.assign` 合并后**广播给房间内所有人（含发送者）**，所有客户端走同一条状态应用路径（`applyRemoteState`）。
- **加入即同步**：`room:join` 时服务端把该房间已激活插件列表（`plugin:list`）发给加入者，迟到者能立刻看到正在播放的内容并跳到当前位置（漂移容差：音乐 2s / 视频 3s）。

### 6.5.2 后端（已完成 ✅）
- 服务 `server/src/services/PluginService.ts`：内存会话管理器（`activate`/`deactivate`/`updateState`/`getState`/`listActive`/`onRoomEmpty`）。key = `${roomId}:${pluginId}`。
- socket 事件（`server/src/socket.ts`，白名单 `music-sync` / `video-sync`）：
  - `plugin:activate`（C→S）→ 校验在房间内 → 激活（`initialState.controllerId = character.id`）→ 房间广播 `plugin:activated` `{ roomId, pluginId, state }`。
  - `plugin:deactivate`（C→S）→ 房间广播 `plugin:deactivated`。
  - `plugin:state-sync`（C→S）→ 合并状态 → `io.to(roomKey)` 广播 `plugin:state`（**含发送者**——修复点：原先 `socket.to` 排除发送者导致 controller 自己的 UI 不更新）。
  - `room:join` → 加入者收 `plugin:list` `{ roomId, plugins: [...] }`。
  - 房间清空时 `PluginService.onRoomEmpty()` 清理该房间全部插件会话。

### 6.5.3 前端（已完成 ✅）
- `stores/plugin.ts`：Pinia store，`activePlugins: Map<roomId, Map<pluginId, { pluginId, state }>>`（Vue 3 reactive 支持 Map），监听 4 个插件事件 + `room:left` 清理。
- `components/game/HUD/plugins.ts`：插件注册表 `BUILTIN_PLUGINS`（id/name/icon/description/component），新增插件只需在此注册 + 服务端白名单加 id。
- `components/game/HUD/ChatPanel.vue`：插件工具栏（每插件一个按钮，active 高亮）+ `<component :is>` 动态渲染插件面板；离开房间时自动停用面板插件。
- `MusicPlayer.vue`（music-sync）：HTML5 `<audio>`，URL 输入 + 播放/暂停 + 进度条 seek + 音量；controller 每 5s 广播 `position`。
- `VideoPlayer.vue`（video-sync）：YouTube IFrame API（懒加载脚本），URL 解析多种格式（watch/youtu.be/embed/纯 ID）；`playerReady` 标志防止 player 未就绪时调用 `getCurrentTime`（修复点）；onStateChange 播放/暂停事件自动广播状态。

### 6.5.4 修复记录（E2E 验证时发现）
1. **controller 判断类型不匹配**：`characterId`（number 5）与 `controllerId`（string "5"）`===` 严格比较恒为 false → 房主看不到播放控件。修复：`String(state?.controllerId) === String(characterStore.characterId)`（MusicPlayer.vue 与 VideoPlayer.vue 均已修）。
2. **controller 收不到自己的状态广播**：服务端 `plugin:state-sync` 原用 `socket.to(roomKey)`（排除发送者），controller 本地 store 永不更新 → now-playing 界面不出现。修复：改为 `io.to(roomKey)` 广播给所有人（见 §6.5.2）。
3. **YouTube player 未就绪就调用 API**：`applyRemoteState` 在 `onReady` 前被事件触发，`getCurrentTime is not a function` 报错。修复：新增 `playerReady` 标志，`onReady` 时置 true，`applyRemoteState`/`broadcastState`/`startProgressBroadcast` 均加防护。

### 6.5.5 验证方式（已通过 ✅）
- 浏览器（player_a）：进入房间 → 点"🎵 一起听歌" → 输入 MP3 URL → 播放中（进度条/暂停/音量正常，pluginState 含 track/position/playing/controllerId）。
- 多端同步（player_b socket 客户端）：join 后收 `plugin:list`（含完整播放状态）+ 周期性 `plugin:state` 广播（每 5s 位置同步）。
- 视频：点"🎬 一起看视频" → 输入 YouTube 链接 → iframe 加载播放，状态广播正常。

---

## 6.7 ⭐ 好友系统（Phase 3，✅ 前后端均已完成）

**任务状态**：已完成。好友申请（信箱）+ 好友列表 + 点击玩家发申请 + 好友传送（5 分钟冷却）端到端验证通过（REST + socket 全链路）。

### 6.7.1 数据库
- `friendships (id, character_id_1, character_id_2, created_at)`：单条记录表示双向好友关系，`character_id_1 < character_id_2`，`UNIQUE KEY idx_pair (character_id_1, character_id_2)`。已建表。
- `friend_requests (id, from_character_id, to_character_id, status ENUM('pending','accepted','rejected'), created_at, responded_at)`。已建表。
  - ⚠️ **重要**：`idx_pair_pending (from_character_id, to_character_id, status)` 是**普通索引（非唯一）**，见 §6.7.6 修复记录——若有人把它改回 UNIQUE 会重现 accept 崩溃。
- `pigeon_messages`（飞鸽传信，GDD 2.7）：**仅建表**，service/routes/UI 未实现（后续扩展项）。

### 6.7.2 后端
- 服务 `server/src/services/FriendService.ts`：`sendRequest` / `acceptRequest` / `rejectRequest` / `getFriendList` / `getPendingRequests` / `removeFriend` / `teleportToFriend` / `isCharacterOnline` / `getFriendCount` / `getFriendIds`。
  - 上限 100 好友；pending 请求双向查重（无唯一索引，靠代码检查）；`teleportToFriend` 用 Redis key `friend:teleport:cooldown:{characterId}`（值=过期时间戳）做 5 分钟冷却，REST 与 socket 共享。
  - 在线判定：Redis `player:{characterId}:position` 键是否存在（5 分钟 TTL，socket 连接时由 `ensurePlayerCached` 写入并每 2 分钟刷新）。
- REST `server/src/routes/friends.ts`（挂载于 `index.ts` 的 `/friends`，均需认证）：
  - `POST /friends/request/:characterId`、`POST /friends/accept/:requestId`、`POST /friends/reject/:requestId`、`GET /friends`、`GET /friends/requests`、`DELETE /friends/:characterId`、`POST /friends/teleport/:characterId`。
- socket 事件（`server/src/socket.ts`）：
  - C→S：`friend:request-state` / `friend:send-request {characterId}` / `friend:accept-request {requestId}` / `friend:reject-request {requestId}` / `friend:remove {characterId}` / `friend:teleport {characterId}`。
  - S→C：`friend:state {friends, requests}` / `friend:request-sent` / `friend:request-received` / `friend:accepted` / `friend:rejected` / `friend:removed` / `friend:teleport-confirmed {characterId, nickname, position, chunkId}`。
  - 跨玩家定向通知用 `characterSocketMap`（`Map<characterId, Set<socketId>>`，connect 注册 / disconnect 清理）+ `getSocketForCharacter(io, characterId)`。
  - `friend:teleport` 处理器完整镜像 `player:move` 的跨区块逻辑：离开旧 chunk 房间 → 广播 leave-chunk → 加入新 chunk → `exploreArea`（迷雾）→ `players:in-chunk` → `player:enter-chunk` → 给自己发 `friend:teleport-confirmed`。

### 6.7.3 前端
- 类型：`api/types.ts` 增 `FriendListItemDTO` / `FriendRequestDTO` / `FriendStateDTO` / `FriendTeleportResultDTO`；`api/http.ts` 增 `apiDelete`。
- `stores/friend.ts`（Pinia）：`friends[]` / `requests[]` / `unreadRequestCount`；动作全部走 socket；`registerFriendListeners()`（幂等）在 `GameView.onMounted` 调用一次。
- UI 组件（`components/game/HUD/`）：
  - `FriendListPanel.vue`：好友列表（在线绿点、传送按钮——离线禁用、移除需确认）。
  - `MailboxPanel.vue`：待处理好友申请（接受/拒绝）。
  - `PlayerInfoCard.vue`：点击其他玩家弹出的信息卡，"发送好友申请"按钮；发送状态由 `friend:request-sent` / `socket:error` 事件更新。
- 场景接线：
  - `OtherPlayerSprite` 构造函数增 `characterId` 参数，`setInteractive` 命中区 `Rectangle(-16,-56,32,64)`，点击发 EventBus `ui:show-player-info`。
  - `WorldScene`：`addOtherPlayer` 传入 characterId；`onFriendTeleportConfirmed` 处理器设置玩家 iso 坐标、更新 characterStore、发 `player:chunk-changed`、按需重载区块资源/房间、刷新迷雾（create/shutdown 中注册/注销）。
- `GameView.vue`：好友/信箱按钮（含未读角标）+ 三块面板/弹窗 + EventBus 处理器。

### 6.7.4 验证方式（已通过 ✅）
- REST：登录 → `POST /friends/request/6` → B `GET /friends/requests` → B `POST /friends/accept/1` → 双方 `GET /friends` → `POST /friends/teleport/6` → 再传送得 429 冷却 → `DELETE /friends/6`。
- socket：A/B 双客户端连接，`friend:send-request` → B 收 `friend:request-received` → B accept → **双方**均收 `friend:accepted` → A `friend:teleport` 收 `friend:teleport-confirmed` 且同区块 `players:in-chunk` 可见 → A `friend:remove` 双方同步。

### 6.7.5 测试流程（player_a / player_b，均 10_10 区块）
```bash
# 登录拿 token（字段名 usernameOrEmail！）
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"player_a","password":"test123456"}'
# 之后带 Authorization: Bearer <token> 调 /friends/* 各端点
```

### 6.7.6 修复记录（E2E 验证时发现）
1. **accept 时 `Duplicate entry '5-6-accepted' for key 'idx_pair_pending'`**：原 schema 把 `UNIQUE KEY idx_pair_pending (from_character_id, to_character_id, status)` 全状态唯一化——同一对好友一旦有历史 accepted/rejected 行，新请求 accept 的 UPDATE 撞唯一键，`friend:accepted` 永远不发出（且 REST 路径同样会 500）。修复：改回**普通索引**，pending 查重由 `FriendService.sendRequest` 显式双向查询完成。⚠️ MySQL 5.7 下不要尝试用生成列实现"仅 pending 唯一"（生成列 ALTER 与表上外键冲突，errno 150）。
2. **服务端错误事件名**：socket 错误统一是 `error`（不是 `socket:error`）；E2E 脚本若漏监听 `error` 会误以为 handler 静默失败。

---

## 6.8 ⭐ 飞鸽传信系统（GDD 2.7，✅ 前后端均已完成）

### 6.8.1 数据库
`pigeon_messages` 表（schema.sql 201-214 行）：`id / from_character_id / to_character_id / content VARCHAR(200) / status ENUM('sending','delivered','read') / deliver_at TIMESTAMP NULL / created_at`。
⚠️ **旧库迁移**：内网库 `192.168.12.1` 上的 `pigeon_messages` 曾是旧结构（`sender_id/receiver_id/distance/calculated_delay/sent_at/delivered_at`），本次已按 schema.sql 结构重建（迁移脚本 `server/scripts/migrate-pigeon-table.ts`，旧数据已映射迁移：sender→from、receiver→to、delivered_at→deliver_at、status 按 delivered_at 是否为空推断）。

### 6.8.2 后端
- **Service**：`server/src/services/PigeonMailService.ts`——`sendMessage`（校验非本人/非空/≤200字/收件人存在；Redis 限流 3条/5分钟，key `pigeon:ratelimit:{characterId}`，超限 429）、`calcDelayMs`（Chebyshev 区块距离 ≤1 即时；同大洲 5 分钟；跨大洲 15 分钟——GDD 建议区间下限，传送门/NPC 航线未实现暂不区分交通档）、`getContinentOfChunk`（象限分四洲）、`getChunkId`（Redis 位置缓存优先 DB 兜底）、`getInbox/getSent`（JOIN 昵称，各取 50 封）、`getUnreadCount`、`markRead`（幂等，仅收件人）、`deliverDueMessages`（到期 sending → delivered，affectedRows 防并发，返回已送达数组）。
- **REST**：`server/src/routes/pigeon.ts`（挂载 `/pigeon`）：`POST /pigeon/send`、`GET /pigeon/inbox`、`GET /pigeon/sent`、`POST /pigeon/:messageId/read`。
- **Socket**（`server/src/socket.ts`）：C→S `pigeon:request-state` / `pigeon:send` / `pigeon:mark-read`；S→C `pigeon:state` / `pigeon:sent`（携带 delayMs）/ `pigeon:delivered`（即时送达或投递 tick 送达时推给在线收件人）/ `pigeon:read-confirmed`。
- **投递 tick**：`initializeSocketIO` 内每 30s 调 `deliverDueMessages()`，送达后用 `getSocketForCharacter` 实时通知在线收件人。

### 6.8.3 前端
- **类型**：`api/types.ts` `PigeonMessageDTO` / `PigeonSendResultDTO`；`EventBus.ts` `pigeon:state / pigeon:sent / pigeon:delivered / pigeon:read-confirmed` 事件。
- **SocketClient**：`pigeon:*` 事件接口 + EventBus 转发。
- **Store**：`stores/pigeon.ts`（inbox/sent/unreadCount；`registerPigeonListeners()` 由 GameView 挂载时调用）。
- **UI**：`components/game/HUD/PigeonMailPanel.vue`——收件/已发送双 tab、发送表单（角色ID+内容+字数计数 0/200）、状态徽章（传递中/已送达/已读）、点击已读、回复按钮；GameView 加 🕊️ 飞鸽传书 按钮（带未读角标）+ 新信 toast。

### 6.8.4 验证方式（已通过 ✅）
1. REST：`powershell -File server/scripts/test-pigeon.ps1`（登录 player_a/b → 发送/收件箱/已发送/标记已读/限流 429/自寄 400/超长 400/不存在收件人 404/未认证 401 全通过）。
2. Socket：`server/scripts/test-pigeon-socket.ts`（需在 client 目录下能解析 socket.io-client 时运行）——双 socket 连接、pigeon:state、即时发送→双方事件、标记已读、错误路径均通过。
3. 投递 tick：插入过期 sending 消息 → 30s 内被 tick 置为 delivered（服务端日志 `Pigeon delivery tick: 1 message(s) delivered`）。
4. `server` 与 `client` 两端 `tsc --noEmit` / `vue-tsc --noEmit` 均通过。

---

## 6.9 ⭐ 团队系统（GDD 2.9，✅ 前后端均已完成）

**任务状态**：已完成。团队创建/搜索/申请/邀请/管理 + 团队聊天端到端验证通过。

### 6.9.1 数据库
- `teams (id, name, description, leader_character_id, max_members, created_at, updated_at)`：团队基本信息，`leader_character_id` FK 到 `characters`。
- `team_members (id, team_id, character_id, role ENUM('leader','member'), joined_at)`：团队成员，`UNIQUE KEY (team_id, character_id)`。
- `team_invitations (id, team_id, from_character_id, to_character_id, status ENUM('pending','accepted','rejected'), created_at, responded_at)`：团队邀请。
- `team_applications (id, team_id, character_id, status ENUM('pending','accepted','rejected'), created_at, responded_at)`：团队申请。

### 6.9.2 后端
- **Service**：`server/src/services/TeamService.ts`——`createTeam`（校验名称唯一/≤20字、队长无其他团队）、`searchTeams`（模糊搜索名称/描述）、`applyToTeam`（校验非成员/非满员）、`acceptApplication`（仅队长）、`rejectApplication`、`inviteToTeam`（仅队长）、`acceptInvitation`、`rejectInvitation`、`kickMember`（仅队长，不能踢自己）、`transferLeadership`、`disbandTeam`（仅队长）、`leaveTeam`（队长不能直接离开需先转让或解散）、`getTeamInfo`、`getTeamMembers`、`getMyTeam`、`getPendingApplications`、`getPendingInvitations`。
- **REST**：`server/src/routes/team.ts`（挂载 `/team`）：`POST /team/create`、`GET /team/search`、`POST /team/apply/:teamId`、`POST /team/accept-application/:applicationId`、`POST /team/reject-application/:applicationId`、`POST /team/invite`、`POST /team/accept-invitation/:invitationId`、`POST /team/reject-invitation/:invitationId`、`POST /team/kick/:memberId`、`POST /team/transfer/:memberId`、`POST /team/disband`、`POST /team/leave`、`GET /team/my-team`、`GET /team/:teamId`、`GET /team/:teamId/members`、`GET /team/applications/pending`、`GET /team/invitations/pending`。
- **Socket**：C→S `team:create` / `team:search` / `team:apply` / `team:accept-application` / `team:reject-application` / `team:invite` / `team:accept-invitation` / `team:reject-invitation` / `team:kick` / `team:transfer` / `team:disband` / `team:leave` / `team:request-state`；S→C `team:created` / `team:search-results` / `team:applied` / `team:application-accepted` / `team:application-rejected` / `team:invited` / `team:invitation-accepted` / `team:invitation-rejected` / `team:kicked` / `team:transferred` / `team:disbanded` / `team:left` / `team:state` / `team:member-joined` / `team:member-left`。
- **团队聊天**：socket 事件 `team:message`（C→S，`{ teamId, content }`）→ 持久化到 `team_messages` 表 → 广播给团队在线成员。

### 6.9.3 前端
- **Store**：`stores/team.ts`（team/members/applications/invitations；`registerTeamListeners()` 由 GameView 挂载时调用）。
- **UI**：`components/game/HUD/TeamPanel.vue`——创建团队表单、搜索团队（模糊搜索+申请加入）、我的团队（成员列表、邀请、踢人、转让队长、解散）、申请/邀请管理（接受/拒绝）、团队聊天 tab；GameView 加 👥 团队按钮 + 新邀请/申请 toast。

### 6.9.4 验证方式（已通过 ✅）
1. REST：登录 → `POST /team/create` → `GET /team/search` → `POST /team/apply/:teamId` → 队长 `POST /team/accept-application/:id` → `GET /team/my-team` → `POST /team/invite` → 被邀请者 `POST /team/accept-invitation/:id` → `POST /team/kick/:memberId` → `POST /team/transfer/:memberId` → `POST /team/disband`。
2. Socket：双客户端连接，`team:create` → `team:search` → `team:apply` → `team:accept-application` → 双方收 `team:member-joined` → `team:message` 团队聊天广播。

---

## 6.10 ⭐ 房屋内部系统（✅ 前后端均已完成）

**任务状态**：已完成。进入房屋后显示2.5D房间视图，可自由布置家具，家具支持插件交互。

### 6.10.1 后端
- **Service**：`server/src/services/InteriorService.ts`——`getInterior`（获取房间内部状态）、`placeFurniture`（放置家具，校验位置/碰撞/资源）、`removeFurniture`（移除家具，返还资源）、`moveFurniture`（移动家具）、`activatePlugin`（激活家具关联的插件）、`deactivatePlugin`（停用插件）。
- **REST**：`server/src/routes/interior.ts`（挂载 `/interior`）：`GET /interior/:roomId`、`POST /interior/:roomId/furniture`、`DELETE /interior/:roomId/furniture/:furnitureId`、`PUT /interior/:roomId/furniture/:furnitureId`、`POST /interior/:roomId/plugin/:pluginId/activate`、`POST /interior/:roomId/plugin/:pluginId/deactivate`。
- **Socket**：C→S `interior:request-state` / `interior:place-furniture` / `interior:remove-furniture` / `interior:move-furniture`；S→C `interior:state` / `interior:furniture-placed` / `interior:furniture-removed` / `interior:furniture-moved`。
- **家具目录**：`FurnitureCatalogEntryDTO` 包含 `id/name/description/icon/resourceCost/size/pluginId`，`pluginId` 可选，关联插件（如牌桌→doudizhu，收音机→radio-fm）。

### 6.10.2 前端
- **Store**：`stores/interior.ts`（furniture list/catalog/active plugins）。
- **Scene**：`game/scenes/InteriorScene.ts`——Phaser 场景渲染2.5D房间，墙壁/地板/家具精灵，拖拽放置家具，点击家具触发插件交互。
- **UI**：`components/game/HUD/InteriorView.vue`——房间内 HUD，包含家具目录面板（可拖拽到房间）、聊天面板、插件容器（动态渲染插件组件）、家具交互提示（靠近时显示 E 键提示）。
- **插件交互**：靠近有 `pluginId` 的家具时，按 E 键或点击触发 `activatePlugin`，插件组件在房间内渲染（如牌桌打开斗地主、收音机打开 FM 播放器）。

### 6.10.3 内建插件
| 插件 ID | 名称 | 组件 | 功能 |
|---------|------|------|------|
| `music-sync` | 一起听歌 | `MusicPlayer.vue` | 房间内同步播放音乐，控制器模式 |
| `video-sync` | 一起看视频 | `VideoPlayer.vue` | YouTube 视频同步播放 |
| `radio-fm` | 收音机 | `RadioPlayer.vue` | FM 广播电台收听 |
| `doudizhu` | 斗地主 | `CardTable.vue` | 多人斗地主纸牌游戏 |

### 6.10.4 验证方式（已通过 ✅）
1. 进入房屋 → 显示2.5D房间视图 → 打开家具目录 → 拖拽家具到房间 → 家具渲染在房间中。
2. 靠近牌桌 → 按 E 键 → 打开斗地主插件 → 多人同步游戏状态。
3. 靠近收音机 → 点击 → 打开 FM 播放器 → 选择电台播放。

---

## 6.11 ⭐ 移动端适配（✅ 前端已完成）

**任务状态**：已完成。移动端响应式布局 + 虚拟摇杆 + 触摸优化。

### 6.11.1 设备检测
- **Composable**：`composables/useMobile.ts`——`isMobile`（<768px）、`isTablet`（768-1024px）、`isDesktop`（≥1024px），窗口 resize 时自动更新（100ms debounce）。

### 6.11.2 移动端布局
- **GameView.vue**：
  - 桌面端：左侧侧边栏菜单 + 右侧游戏画布。
  - 移动端：隐藏侧边栏，底部虚拟摇杆 + 操作按钮（交互/菜单），底部弹出式功能菜单（背包/建造/好友/信箱/飞鸽/团队），全屏滑动面板。
- **InteriorView.vue**：
  - 移动端：插件容器和聊天面板移到底部，全宽，圆角顶部，更大的触摸目标。
- **ChatPanel.vue**：
  - 移动端：输入框和按钮 padding 增大（10px），font-size 增大（16px），插件按钮 padding 增大。

### 6.11.3 虚拟控件
- **MobileControls.vue**：
  - 左下角虚拟摇杆（120px 底座 +50px 摇杆），触摸拖拽控制移动方向，阈值0.3 触发移动事件。
  - 右下角操作按钮：交互（E 键）、菜单（切换底部抽屉）。
  - 防止触摸事件冒泡到游戏画布（`preventTouchDefault`）。

### 6.11.4 响应式断点
- `<768px`：移动端布局，虚拟摇杆，底部菜单。
- `768-1024px`：平板端，可选择性适配。
- `≥1024px`：桌面端布局。

---

## 6.12 ⭐ 城镇传送门系统（✅ 前后端均已完成）

**任务状态**：已完成。玩家可在已到访城镇之间快速传送，传送会同步位置、房间成员和探索范围。

### 6.12.1 后端
- **数据表**：`towns`、`portals`、`town_visits`，另提供 `server/src/db/migrations/002-town-portals.sql` 迁移脚本。
- **Service**：`server/src/services/TownService.ts`——城镇列表、当前区块懒创建、到访解锁、传送校验、Redis 传送冷却、目标区域探索。
- **REST**：认证接口 `GET /town` 返回城镇与当前角色的解锁/冷却状态。
- **Socket**：`town:request-state` 获取状态，`town:teleport` 请求传送；服务端权威更新数据库与 Redis 位置缓存，切换区块房间并同步玩家进入/离开事件。
- **冷却**：每个角色对每个传送门独立计时，默认 30 秒，使用 Redis `SET NX EX` 防止并发绕过。

### 6.12.2 前端
- **Store**：`stores/town.ts` 管理城镇状态、解锁列表和 Socket 事件。
- **UI**：`TownPortalPanel.vue` 显示已解锁城镇、所在大洲和剩余冷却时间；冷却期间按钮禁用。
- **世界同步**：传送确认后 `WorldScene` 刷新区块、玩家位置和探索迷雾。

### 6.12.3 验证方式（已通过 ✅）
1. `server` 执行 `npm run build`。
2. `client/reifuu-chat` 执行 `yarn vue-tsc --noEmit`。
3. `git diff --check`。

---

## 6.13 ⭐ 交通工具系统（Phase 3：马匹/马车，✅ 前后端均已完成）

- `vehicles` 表及迁移 `server/src/db/migrations/003-vehicles.sql`，模板成本为木材 50 + 石材 20，速度倍率 150%。
- `GET /vehicle/templates`、`GET /vehicle`、`POST /vehicle/craft`、`POST /vehicle/:vehicleId/equip`、`POST /vehicle/unequip` 均需 JWT。
- `MovementService` 按装备载具将单次移动上限从 10 提升至 15，并在 `player:move-confirmed` 与 `GET /character/me` 返回装备状态。
- 客户端 `VehicleCraftPanel.vue`、`stores/vehicle.ts` 已接入 GameView 桌面侧栏及移动端菜单。
- 初始化数据库时执行最新 schema 或单独执行 003 迁移。

---

## 7. 测试账号（仍在数据库中）

| 账号 | 密码 | 角色 | 出生区块 | 世界坐标 |
|---|---|---|---|---|
| `player_a` | `test123456` | PlayerA | 10_10 | (325, 325) |
| `player_b` | `test123456` | PlayerB | 10_10 | (325, 325) |

其他遗留账号：`testuser`/Reifuu(10_10)、`testuser2`/TestHero(10_10)、`BSTluo`、`Reifuu`、`testuser123`、`newuser1788364161871`。
> 说明：同一区块多个角色坐标**完全相同**（同一出生点），属正常现象；后续可加出生点随机偏移。

---

## 8. 关键修复记录（重要背景，别再踩坑）

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

## 9. 已知问题 / 待确认

- **初始视野范围口径已统一**：GDD 2.6 写 5x5，服务端已用 `exploreArea(..., 2)` = 5x5。若策划后续改口径，改 `server/src/socket.ts` 的半径。
- ~~前端迷雾完全未做~~（**已解决**，§5.2 完成）。
- 小地图、资源节点/建造/聊天室前端交互 UI（**已补齐**：`WorldScene` 资源节点渲染 + `GameView` 背包/建造面板）。
- ~~好友系统~~（**已完成** §6.7）；高级交通工具系统仍未实现（GDD Phase 4.5）。
- 聊天室成员角色（房主/成员/访客）目前仅有房主 vs 访客二分，邀请制与成员管理未实现（见 §6.2）。
- ~~飞鸽传信~~（**已完成** §6.8）：仅建表 → 现 service/routes/socket/UI 均已实现并验证通过。
- 数据库 `192.168.12.1` 是内网地址，换环境/远程时需改 `.env`（曾有短暂不可达导致 500）。
- **表结构迁移注意**：`schema.sql` 用 `CREATE TABLE IF NOT EXISTS`，不会 ALTER 已存在的表。若在旧库上跑 schema，`map_chunks` / `resource_nodes` / `inventory_items` / `chat_rooms` 等新列需手动迁移或删表重建（本次交接中 `map_chunks` 因缺 `chunk_id/chunk_type/owner_id/is_public` 列已重建）。
- **`/auth/login` 字段名**是 `usernameOrEmail`（不是 `username`），`/auth/register` 才是 `username`。API 响应格式 `{ status, data }` 或 `{ status, message }`。

---

## 10. 下一步建议（给下个团队）

1. 先通读本文件 + `docs/GDD.md` + `docs/ART_STYLE_GUIDE.md`（此目录不是 git 仓库）。
2. ~~视野迷雾前端~~（**已完成** §5.2）。
3. ~~复核现有 API 的前端对接~~（**已完成**：资源采集/建造/背包/聊天室均已端到端联通并 REST 验证通过）。
4. ~~进入聊天室实际使用~~（**已完成** §6）：点击房屋标记 → 进入房间 → 实时文字聊天，前后端 + 浏览器 UI 均验证通过。
5. ~~聊天室进阶功能~~（**音乐/视频同步播放已完成** §6.5、**房屋内部系统已完成** §6.10）：房间权限管理（成员角色/邀请制）、房间装饰系统待实现。
6. ~~插件扩展~~（**已完成** §6.5、§6.10）：当前内建四个插件（`music-sync` / `video-sync` / `radio-fm` / `doudizhu`）已可用于房屋家具交互；新增插件只需：①在 `plugins.ts` 注册（id/name/icon/component）②在服务端 `socket.ts` 的 `allowedPlugins` 数组加 id ③编写插件 Vue 组件（props: `roomId`，emit: `close`）。
7. ~~规划 Phase 3（好友/社交、传送门）~~（**好友系统已完成** §6.7，**飞鸽传信已完成** §6.8，**团队系统已完成** §6.9，**传送门系统已完成** §6.12）与 Phase 4（交通工具）。
8. ~~移动端适配~~（**已完成** §6.11）：虚拟摇杆、响应式布局、触摸优化已全部实现，可接受移动设备测试。
9. **后续功能**：
   - 交通工具（Phase 4）：马车/骑马跨区块移动。
   - 高级交通工具（Phase 4.5）：船只、飞行器跨洲。
   - 房间权限管理：邀请制成员、访客隔离。
   - 房间装饰/家具系统扩展：自定义贴图、动画。
10. 建议为前端新增 UI/UX 专职成员补齐界面质感（该角色上一团队已移除）。
11. 前端接入正式美术资源时替换 `PreloadScene` 的 Graphics 生成贴图（贴图 key 不变即可平滑替换）。
