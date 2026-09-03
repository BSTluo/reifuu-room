# Reifuu Room — 项目移交文件（HANDOFF）

> 本文件用于**当前团队 → 下一个团队**的工作交接。它记录项目当前真实状态、已完成/进行中/待办工作、团队结构、运行方式与已知问题。
> 下一个团队接手时，请先通读本文件 + `docs/GDD.md`，再检查代码现状。
> 最后更新：2026-09-03

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

**核心玩法（见 GDD）**：用户注册/登录 → 创建角色（选出生大洲/外观）→ 在分区块的等距世界里移动/探索 → 采集资源（木/石/矿）→ 建造聊天室 → 多人实时可见/移动同步 → 视野迷雾（Phase 2 进行中）。

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

### 4.3 资源采集（已完成）
- `server/src/services/ResourceService.ts`：区块内程序生成资源节点（木/石/矿），采集进背包，周期重生。
- 表：`resource_nodes`、`inventory_items`。

### 4.4 建造系统（已完成）
- `server/src/services/BuildService.ts`：用资源在区块上建造聊天室（`wooden_house`/`stone_house`/`advanced_house`）。
- 表：`map_chunks`、`chat_rooms`。含公开/私有、所有权上限等。

### 4.5 视野迷雾系统（Phase 2，后端已完成）
见 §5 —— 这是当前交接的核心。

---

## 5. ⭐ 当前进行中 / 待交接的工作：视野迷雾系统

**任务状态**：`in_progress`，原本拥有者=前端开发。
**后端已完成并验证**；**前端未做**。

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

### 5.2 前端（❌ 尚未实现，需下个团队做）
GDD 2.6 与任务描述要求：
1. `WorldScene` 增加迷雾遮罩层（Phaser Graphics / RenderTexture）：
   - 未探索区块 = 纯黑遮罩。
   - 已探索但不当前可视 = 降饱和/灰白（"记忆中地图"）。
   - 当前可视（玩家周围 5x5） = 正常彩色。
2. 接入 socket 事件：`src/game/EventBus.ts` **已添加** `map:initial-explored` 与 `map:explore` 的事件签名；`src/game/network/SocketClient.ts` **已转发**这两个事件到 EventBus。前端只需在场景/store 里监听。
3. Pinia `exploration` store：管理已探索集合 + 当前可视范围。
4. 小地图（minimap）：已探索区域缩略图，未探索显示迷雾。
5. 平滑揭开动画 + 迷雾边缘渐变。

> 设计口径提示（见 §8）：GDD 写初始 5x5，服务端目前初始只探索出生点 3x3，若要 5x5 需后端 `exploreArea` 半径调为 2。

### 5.3 验证方式
```bash
# 1) 看后端探索接口
curl -H "Authorization: Bearer <token>" http://localhost:3000/map/explored
# 2) socket 初始 + 增量探索事件（client 目录下用 socket.io-client）
#    监听 map:initial-explored / map:explore / player:move-confirmed
```

---

## 6. 测试账号（仍在数据库中）

| 账号 | 密码 | 角色 | 出生区块 | 世界坐标 |
|---|---|---|---|---|
| `player_a` | `test123456` | PlayerA | 10_10 | (325, 325) |
| `player_b` | `test123456` | PlayerB | 10_10 | (325, 325) |

其他遗留账号：`testuser`/Reifuu(10_10)、`testuser2`/TestHero(10_10)、`BSTluo`、`Reifuu`、`testuser123`、`newuser1788364161871`。
> 说明：同一区块多个角色坐标**完全相同**（同一出生点），属正常现象；后续可加出生点随机偏移。

---

## 7. 关键修复记录（重要背景，别再踩坑）

1. **世界观坐标 bug**：旧数据把区块内坐标当世界坐标存（(5,5) 而非 (325,325)），导致多人不在同一区块、互相看不见。已在 `CharacterService` 修复 + 用 `server/fix_character_positions.sql` / JS 脚本迁移存量。现存角色坐标已世界化。
2. **同区块玩家互相可见**：此前 `getPlayersInChunk` 只扫 Redis，而"从未移动"的玩家无 Redis 键 → 别人看不到他。修复：新增 `MovementService.ensurePlayerCached()`（连接时把 DB 位置写回 Redis）＋ `client:request-chunk-players` 握手（客户端注册完监听器后再请求名单，避免推送早于监听注册的竞态）。
3. **地图块类型不同步**：之前用 `Math.random()` 每端各自随机 → 地形不一致。修复：新增 `client/reifuu-chat/src/game/utils/rng.ts`（FNV-1a 哈希 + mulberry32 确定性 PRNG），`WorldScene.generateMap(chunkId)` 用 `chunkId` 做种子，同一区块所有玩家生成一致地形。
4. **登录卡加载 / 刷新才正常**：多为后端未运行（转圈）、或 token 持久化未验证即自动登入。相关：App.vue 的 loading 判定、401 处理、登录后 `loadCharacter`；CharacterCreateView 有「退出」按钮兜底。
5. **API 性能**：角色存在性检查已加 Redis 缓存（命中 ~15ms）+ MySQL 连接池调优（queueLimit/connectTimeout/maxIdle/idleTimeout + 每条查询 5s 超时）+ 慢查询日志。

前端 `vue-tsc --noEmit` 应能通过（若报类型错多为 rng/EventBus/SocketClient 签名，需随改动同步更新）。

---

## 8. 已知问题 / 待确认

- **初始视野范围口径不一致**：GDD 2.6 写"初始 5x5 区块"，但"探索逻辑"又写"3x3 范围"。服务端当前实现为**出生点 3x3**。下个团队需和策划确认取哪个口径，并相应改 `ExplorationService.exploreArea` 半径。
- **前端迷雾完全未做**（§5.2）。
- 小地图、资源节点/建造/聊天室的**前端交互 UI** 覆盖度需复核（后端 API 大多就绪，前端对接口程度不一）。
- 好友系统 / 交通工具系统 / 传送门系统仍未实现（GDD Phase 3/4）。
- 数据库 `192.168.12.1` 是内网地址，换环境/远程时需改 `.env`（曾有短暂不可达导致 500）。

---

## 9. 下一步建议（给下个团队）

1. 先通读本文件 + `docs/GDD.md` + `docs/ART_STYLE_GUIDE.md`（此目录不是 git 仓库）。
2. **优先做完视野迷雾前端**（§5.2），并确认初始视野口径（§8）。
3. 复核现有 API 的前端对接（资源采集 / 建造 / 背包 / 聊天室）是否端到端可用。
4. 规划 Phase 3（好友/社交、传送门）与 Phase 4（交通工具）。
5. 建议为前端新增 UI/UX 专职成员补齐界面质感（该角色上一团队已移除）。
