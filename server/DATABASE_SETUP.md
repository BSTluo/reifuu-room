# 数据库初始化指南

## MySQL数据库设置

### 1. 创建数据库

```sql
CREATE DATABASE IF NOT EXISTS `reifuu-chat` 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;
```

### 2. 创建用户（如果需要）

```sql
CREATE USER 'reifuu-chat'@'%' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON `reifuu-chat`.* TO 'reifuu-chat'@'%';
FLUSH PRIVILEGES;
```

### 3. 导入表结构

```bash
mysql -h 192.168.12.1 -u reifuu-chat -p reifuu-chat < src/db/schema.sql
```

或在MySQL客户端中：

```sql
USE `reifuu-chat`;
SOURCE src/db/schema.sql;
```

## 数据表说明

### users
用户账户表
- `id`: 用户ID（自增主键）
- `username`: 用户名（唯一）
- `password_hash`: 密码哈希
- `created_at`, `updated_at`: 时间戳

### rooms
房间表
- `id`: 房间ID
- `name`: 房间名称
- `owner_id`: 房主用户ID
- `max_players`: 最大玩家数
- `created_at`, `updated_at`: 时间戳

### players
玩家位置表（使用网格坐标）
- `id`: 玩家ID
- `user_id`: 关联用户
- `room_id`: 所在房间
- `grid_x`, `grid_y`, `grid_z`: **网格坐标**（非屏幕坐标）
- `created_at`, `updated_at`: 时间戳

### resources
资源表
- `id`: 资源ID
- `player_id`: 玩家ID
- `resource_type`: 资源类型
- `quantity`: 数量
- `created_at`, `updated_at`: 时间戳

### map_chunks
地图区块表（使用网格坐标）
- `id`: 区块ID
- `room_id`: 所属房间
- `chunk_x`, `chunk_y`: **网格坐标**的区块位置
- `chunk_data`: JSON格式的区块数据
- `created_at`, `updated_at`: 时间戳

## 坐标系说明

**重要**：服务器使用网格坐标系统

- 所有位置数据使用网格坐标(grid x, y)存储
- 前端负责将网格坐标转换为等距投影屏幕坐标
- 服务器只处理逻辑坐标，不涉及渲染坐标转换

## Redis设置

Redis用于：
- 会话存储
- 实时数据缓存
- 消息队列（后续功能）

配置：
- Host: 192.168.12.1
- Port: 6379
- Password: BSO1005CFXL
- DB: 1
- Key Prefix: reifuu:

所有Redis key会自动添加`reifuu:`前缀。

## 验证安装

启动服务器后，检查日志：

```
✅ MySQL connection established
✅ MySQL connection test successful
✅ Server running on port 3000
```

测试health端点：
```bash
curl http://localhost:3000/health
```

预期返回：
```json
{
  "status": "ok",
  "timestamp": "2026-09-01T...",
  "uptime": 123.45
}
```
