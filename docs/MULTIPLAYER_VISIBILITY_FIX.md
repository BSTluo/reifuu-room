# 多人可见性Bug修复说明

## 问题描述
两个玩家注册后进入游戏，无法看到对方，且似乎处于不同的地图。

## 根本原因
坐标系统不一致：
- **数据库保存**: 区块内坐标 (gridX: 5, gridY: 5)
- **区块计算**: Math.floor(5 / 32) = 0 → 区块 0_0
- **但currentChunkId字段**: 10_10

结果：
- 玩家连接时加入房间 `10_10`（从currentChunkId读取）
- 首次移动时从数据库读取坐标 `5,5`，计算出区块 `0_0`
- 触发区块切换，离开 `10_10` 加入 `0_0`
- 两个玩家可能在不同的切换状态，导致看不到对方

## 修复方案

### 1. 更新CharacterService（server/src/services/CharacterService.ts）
将区块坐标转换为世界坐标后再保存：
```typescript
// 世界坐标 = 区块X * 32 + 区块内X
const worldX = spawnPoint.chunkX * 32 + spawnPoint.gridX; // 10 * 32 + 5 = 325
const worldY = spawnPoint.chunkY * 32 + spawnPoint.gridY; // 10 * 32 + 5 = 325
```

### 2. 修复已有数据
运行数据库迁移脚本（server/scripts/fix-character-positions.js）：
```sql
UPDATE characters
SET
  grid_x = CASE WHEN grid_x < 32 THEN 10 * 32 + grid_x ELSE grid_x END,
  grid_y = CASE WHEN grid_y < 32 THEN 10 * 32 + grid_y ELSE grid_y END
WHERE current_chunk_id = '10_10' AND (grid_x < 32 OR grid_y < 32);
```

结果：TestHero的坐标从 `5,5` 更新到 `325,325`

### 3. 清除缓存
重启后端服务器，清除Redis中的旧位置缓存。

## 测试步骤

1. **完全退出游戏**：如果之前有打开的游戏窗口，请全部关闭
2. **打开两个浏览器窗口**（或使用隐身模式）
3. **登录已有账号** 或 **注册新账号**
4. **进入游戏**：两个玩家应该能立即看到对方（灰色头像+昵称）
5. **测试移动**：移动时对方应该看到你的位置实时更新

## 预期结果
- ✅ 两个玩家在同一个区块（10_10）
- ✅ 能看到对方的灰色头像和昵称
- ✅ 移动时位置实时同步
- ✅ 控制台显示正确的区块加入日志

## 文件修改
- `server/src/services/CharacterService.ts` - 坐标转换逻辑
- `server/src/socket.ts` - 连接时位置缓存优化
- `server/scripts/fix-character-positions.js` - 数据迁移脚本
- `docs/MULTIPLAYER_TEST_GUIDE.md` - 测试指南更新
