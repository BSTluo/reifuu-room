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
- 好友系统 / 交通工具系统 / 传送门系统仍未实现（GDD Phase 3/4）。
- 聊天室成员角色（房主/成员/访客）目前仅有房主 vs 访客二分，邀请制与成员管理未实现（见 §6.2）。
- 数据库 `192.168.12.1` 是内网地址，换环境/远程时需改 `.env`（曾有短暂不可达导致 500）。
- **表结构迁移注意**：`schema.sql` 用 `CREATE TABLE IF NOT EXISTS`，不会 ALTER 已存在的表。若在旧库上跑 schema，`map_chunks` / `resource_nodes` / `inventory_items` / `chat_rooms` 等新列需手动迁移或删表重建（本次交接中 `map_chunks` 因缺 `chunk_id/chunk_type/owner_id/is_public` 列已重建）。
- **`/auth/login` 字段名**是 `usernameOrEmail`（不是 `username`），`/auth/register` 才是 `username`。API 响应格式 `{ status, data }` 或 `{ status, message }`。

---

## 10. 下一步建议（给下个团队）

1. 先通读本文件 + `docs/GDD.md` + `docs/ART_STYLE_GUIDE.md`（此目录不是 git 仓库）。
2. ~~视野迷雾前端~~（**已完成** §5.2）。
3. ~~复核现有 API 的前端对接~~（**已完成**：资源采集/建造/背包/聊天室均已端到端联通并 REST 验证通过）。
4. ~~进入聊天室实际使用~~（**已完成** §6）：点击房屋标记 → 进入房间 → 实时文字聊天，前后端 + 浏览器 UI 均验证通过。
5. **聊天室进阶功能**：房间权限管理（成员角色/邀请制）、音乐/视频同步播放、房间装饰系统。
6. 规划 Phase 3（好友/社交、传送门）与 Phase 4（交通工具）。
7. 建议为前端新增 UI/UX 专职成员补齐界面质感（该角色上一团队已移除）。
8. 前端接入正式美术资源时替换 `PreloadScene` 的 Graphics 生成贴图（贴图 key 不变即可平滑替换）。
