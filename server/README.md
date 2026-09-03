# Reifuu Room - 后端服务器

Node.js + TypeScript + Express + Socket.io 游戏后端服务器

## 项目结构

```
server/
├── src/
│   ├── config.ts                 # 配置加载
│   ├── index.ts                  # 应用入口
│   ├── socket.ts                 # Socket.io初始化
│   ├── db/
│   │   ├── mysql.ts              # MySQL连接池
│   │   ├── redis.ts              # Redis客户端
│   │   └── schema.sql            # 数据库架构（MySQL语法）
│   ├── middleware/
│   │   ├── auth.ts               # JWT认证中间件
│   │   └── errorHandler.ts      # 错误处理中间件
│   ├── routes/
│   │   ├── health.ts             # 健康检查路由
│   │   └── auth.ts               # 认证路由
│   ├── services/
│   │   ├── AuthService.ts        # 认证服务
│   │   ├── MovementService.ts    # 移动服务（骨架）
│   │   └── ResourceService.ts    # 资源服务（骨架）
│   └── utils/
│       ├── logger.ts             # 日志工具
│       ├── jwt.ts                # JWT工具
│       └── validation.ts         # 输入验证工具
├── .env                          # 环境变量（开发）
├── .env.example                  # 环境变量模板
├── package.json
└── tsconfig.json
```

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境变量

复制`.env.example`为`.env`并根据需要修改配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
mysql -h your_host -u your_user -p your_database < src/db/schema.sql
```

### 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 http://localhost:3000 启动

## API端点

### 认证API

#### 注册
- **POST /auth/register**
  - Body: `{ username, email, password }`
  - 返回: 用户信息
  - 验证: 邮箱格式、密码≥8位、用户名唯一

#### 登录
- **POST /auth/login**
  - Body: `{ username, password }` （username可以是邮箱）
  - 返回: `{ accessToken, refreshToken, user }`
  - Access Token有效期: 1小时
  - Refresh Token有效期: 7天

#### 刷新Token
- **POST /auth/refresh**
  - Body: `{ refreshToken }`
  - 返回: `{ accessToken, user }`

#### 登出
- **POST /auth/logout**
  - Header: `Authorization: Bearer {accessToken}`
  - 返回: 成功消息

#### 获取当前用户
- **GET /auth/me**
  - Header: `Authorization: Bearer {accessToken}`
  - 返回: 当前用户信息

### 其他API

- `GET /health` - 健康检查

详细测试指南请参考：[AUTHENTICATION_TEST.md](./AUTHENTICATION_TEST.md)

### WebSocket

Socket.io服务器运行在相同端口（3000），**需要JWT access token进行认证**。

**连接示例**：
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-access-token'  // 使用登录返回的accessToken
  }
});
```

**事件**：
- `echo` - 回声测试
- `move` - 移动事件（待实现）

## 开发命令

- `npm run dev` - 启动开发服务器（hot reload）
- `npm run build` - 编译TypeScript
- `npm start` - 运行生产版本

## 数据库

### MySQL

使用提供的schema.sql初始化数据库：
```bash
mysql -h DB_HOST -u DB_USER -p DB_DATABASE < src/db/schema.sql
```

**坐标系说明**：
- 所有位置数据使用**网格坐标(grid x, y)**存储
- Players表使用`grid_x`, `grid_y`, `grid_z`字段
- MapChunks表使用`chunk_x`, `chunk_y`字段
- 前端负责网格坐标与等距屏幕坐标的转换

### Redis

Redis用于会话存储和实时数据缓存。配置包含：
- Key前缀：自动为所有key添加`reifuu:`前缀
- DB选择：可配置使用不同的数据库编号
- TLS支持：可选启用

## 技术栈

- **运行时**: Node.js
- **语言**: TypeScript
- **Web框架**: Express
- **WebSocket**: Socket.io
- **数据库**: MySQL + Redis
- **认证**: JWT + bcrypt
- **日志**: Winston

## 下一步

- [ ] 实现完整的移动系统
- [ ] 实现资源管理系统
- [ ] 添加房间管理功能
- [ ] 添加测试
- [ ] 实现数据库迁移系统
