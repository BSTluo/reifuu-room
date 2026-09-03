# 多人位置同步系统测试指南

## 功能概述

Phase 2实现了基于WebSocket的多人实时位置同步系统，支持：
- 实时位置广播
- 区块房间管理
- 玩家进入/离开通知
- 移动验证（防止作弊）

## WebSocket协议

### 客户端 → 服务端

#### 1. 玩家移动
```javascript
socket.emit('player:move', {
  x: 10.5,  // 网格坐标
  y: 20.3
});
```

### 服务端 → 客户端

#### 1. 移动确认
```javascript
socket.on('player:move-confirmed', (data) => {
  // data: { position: {x, y}, chunkId: "10_10" }
});
```

#### 2. 同区块玩家列表
```javascript
socket.on('players:in-chunk', (data) => {
  // data: { players: [{characterId, nickname, position}] }
  // 当连接或切换区块时收到
});
```

#### 3. 位置更新广播
```javascript
socket.on('players:position-update', (data) => {
  // data: { characterId: "123", position: {x, y} }
  // 同区块其他玩家移动时收到
});
```

#### 4. 玩家进入区块
```javascript
socket.on('player:enter-chunk', (data) => {
  // data: { characterId: "123", nickname: "Hero", position: {x, y} }
  // 有新玩家进入当前区块
});
```

#### 5. 玩家离开区块
```javascript
socket.on('player:leave-chunk', (data) => {
  // data: { characterId: "123" }
  // 有玩家离开当前区块（移动到其他区块或断开连接）
});
```

## 移动验证

系统包含以下验证机制：
- **距离验证**：单次移动距离不能超过10个网格单位（防止传送作弊）
- **区块管理**：自动计算并管理玩家所在区块（每32x32网格为一个区块）
- **缓存机制**：使用Redis缓存玩家位置，减少数据库压力

## 区块系统

区块ID格式：`{chunkX}_{chunkY}`

计算规则：
```javascript
chunkX = Math.floor(gridX / 32)
chunkY = Math.floor(gridY / 32)
```

例如：
- 位置 (5, 5) → 区块 "0_0"
- 位置 (50, 100) → 区块 "1_3"
- 位置 (-10, 20) → 区块 "-1_0"

## 测试步骤

### 1. 启动服务器

```bash
cd server
npm run dev
```

确认日志显示：
```
✅ Redis connected successfully
✅ MySQL connection test successful
✅ Server running on port 3000
```

### 2. 创建测试用户和角色

```bash
# 注册用户1
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"player1","email":"player1@test.com","password":"password123"}'

# 登录用户1
LOGIN1=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"player1","password":"password123"}')

TOKEN1=$(echo $LOGIN1 | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

# 创建角色1
curl -X POST http://localhost:3000/character/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN1" \
  -d '{
    "nickname": "Hero1",
    "appearance": {"gender":"male","hair":"short","skin":"fair","outfit":"warrior"},
    "startContinent": "east"
  }'

# 重复上述步骤创建player2
```

### 3. WebSocket连接测试

创建 `test-movement.js`:

```javascript
import { io } from 'socket.io-client';

const TOKEN1 = 'your_player1_access_token';
const TOKEN2 = 'your_player2_access_token';

// Player 1 连接
const socket1 = io('http://localhost:3000', {
  auth: { token: TOKEN1 }
});

socket1.on('connect', () => {
  console.log('Player 1 connected:', socket1.id);
});

socket1.on('players:in-chunk', (data) => {
  console.log('Player 1 sees players:', data.players);
});

socket1.on('player:enter-chunk', (data) => {
  console.log('Player entered chunk:', data.nickname);
});

socket1.on('players:position-update', (data) => {
  console.log('Position update:', data);
});

socket1.on('player:leave-chunk', (data) => {
  console.log('Player left chunk:', data.characterId);
});

// Player 2 连接（延迟2秒）
setTimeout(() => {
  const socket2 = io('http://localhost:3000', {
    auth: { token: TOKEN2 }
  });

  socket2.on('connect', () => {
    console.log('Player 2 connected:', socket2.id);

    // Player 2 移动
    setInterval(() => {
      const x = Math.random() * 20;
      const y = Math.random() * 20;
      socket2.emit('player:move', { x, y });
      console.log(`Player 2 moved to (${x.toFixed(2)}, ${y.toFixed(2)})`);
    }, 2000);
  });

  socket2.on('player:move-confirmed', (data) => {
    console.log('Player 2 move confirmed:', data);
  });

  socket2.on('players:in-chunk', (data) => {
    console.log('Player 2 sees players:', data.players);
  });
}, 2000);
```

运行测试：
```bash
node test-movement.js
```

**预期输出**：
```
Player 1 connected: abc123...
Player 1 sees players: []
Player 2 connected: def456...
Player 2 sees players: [{characterId: "1", nickname: "Hero1", ...}]
Player entered chunk: Hero2
Position update: {characterId: "2", position: {x: 10.5, y: 15.3}}
...
```

### 4. 区块切换测试

让玩家移动到不同区块：

```javascript
// 从区块 0_0 移动到区块 1_0
socket.emit('player:move', { x: 40, y: 10 });  // chunkX = floor(40/32) = 1
```

**预期行为**：
1. Player 1 收到 `player:leave-chunk` 事件（Player 2离开）
2. Player 2 收到新区块的 `players:in-chunk` 列表
3. 新区块的玩家收到 `player:enter-chunk` 事件

## 性能考虑

- **Redis缓存**：玩家位置缓存5分钟，减少数据库查询
- **异步数据库更新**：位置更新立即缓存，异步写入数据库
- **区块房间**：使用Socket.io的room机制，只向同区块玩家广播
- **防抖动**：客户端应实现移动防抖，避免频繁发送位置更新

## 前端集成建议

```typescript
// 在WorldScene中
class WorldScene {
  private otherPlayers = new Map<string, OtherPlayerSprite>();

  setupSocket() {
    this.socket.on('players:in-chunk', (data) => {
      // 清除所有其他玩家
      this.otherPlayers.forEach(sprite => sprite.destroy());
      this.otherPlayers.clear();

      // 添加区块内的所有玩家
      data.players.forEach(player => {
        this.addOtherPlayer(player);
      });
    });

    this.socket.on('player:enter-chunk', (data) => {
      this.addOtherPlayer(data);
    });

    this.socket.on('players:position-update', (data) => {
      const player = this.otherPlayers.get(data.characterId);
      if (player) {
        player.moveTo(data.position);
      }
    });

    this.socket.on('player:leave-chunk', (data) => {
      const player = this.otherPlayers.get(data.characterId);
      if (player) {
        player.destroy();
        this.otherPlayers.delete(data.characterId);
      }
    });
  }

  addOtherPlayer(data: {characterId: string, nickname: string, position: {x, y}}) {
    const sprite = new OtherPlayerSprite(
      this,
      data.position.x,
      data.position.y,
      data.nickname
    );
    this.otherPlayers.set(data.characterId, sprite);
  }
}
```

## 故障排查

### 问题：玩家看不到彼此
- 检查是否在同一区块
- 确认WebSocket连接成功
- 查看服务器日志中的房间加入信息

### 问题：移动被拒绝
- 检查移动距离是否超过10个单位
- 确认access token有效

### 问题：Redis连接失败
- 检查Redis服务是否运行
- 验证.env中的Redis配置正确

## 验收标准检查

- [ ] ✅ 多个玩家登录后能在地图上看到彼此
- [ ] ✅ 玩家移动时，其他玩家能实时看到移动
- [ ] ✅ 玩家昵称正确显示
- [ ] ✅ 离开区块的玩家从视野中消失
- [ ] ✅ 移动距离验证正常工作
- [ ] ✅ Redis缓存正常工作
- [ ] ✅ 区块房间切换正常
