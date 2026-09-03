# JWT认证系统测试指南

## 前置条件

### 1. 初始化数据库表

在测试前，需要先创建数据库表：

```bash
mysql -h 192.168.12.1 -u reifuu-chat -p reifuu-chat < src/db/schema.sql
```

或在MySQL客户端中执行：
```sql
USE `reifuu-chat`;
SOURCE src/db/schema.sql;
```

确认表已创建：
```sql
SHOW TABLES;
DESCRIBE users;
```

### 2. 启动服务器

```bash
npm run dev
```

## API测试

### 1. 用户注册

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

**预期响应**：
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "message": "Registration successful"
  }
}
```

**验证规则**：
- ✅ Username: 3-50字符，只能包含字母、数字、下划线和连字符
- ✅ Email: 必须是有效的邮箱格式
- ✅ Password: 最少8位
- ✅ Username和Email必须唯一

**错误测试**：
```bash
# 密码太短
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user2","email":"user2@test.com","password":"short"}'

# 无效邮箱
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user3","email":"invalid-email","password":"password123"}'

# 重复用户名
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"another@test.com","password":"password123"}'
```

### 2. 用户登录

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

**预期响应**：
```json
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com"
    }
  }
}
```

**Token有效期**：
- Access Token: 1小时
- Refresh Token: 7天

**使用邮箱登录**：
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "password123"
  }'
```

### 3. 访问受保护的端点

使用登录返回的access token：

```bash
# 保存token
ACCESS_TOKEN="your_access_token_here"

# 测试认证
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**预期响应**：
```json
{
  "status": "success",
  "data": {
    "user": {
      "userId": "1",
      "username": "testuser",
      "type": "access"
    }
  }
}
```

### 4. 刷新Token

当access token过期后，使用refresh token获取新的access token：

```bash
REFRESH_TOKEN="your_refresh_token_here"

curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

**预期响应**：
```json
{
  "status": "success",
  "data": {
    "accessToken": "new_access_token...",
    "user": {
      "id": 1,
      "username": "testuser",
      "email": "test@example.com"
    }
  }
}
```

### 5. 登出

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**预期响应**：
```json
{
  "status": "success",
  "data": {
    "message": "Logout successful"
  }
}
```

登出后，该用户的refresh token将被清除，旧的refresh token将无法使用。

## WebSocket连接测试

### 使用Node.js测试脚本

创建 `test-socket.js`:

```javascript
import { io } from 'socket.io-client';

const ACCESS_TOKEN = 'your_access_token_here';

const socket = io('http://localhost:3000', {
  auth: {
    token: ACCESS_TOKEN
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to WebSocket server');
  console.log('Socket ID:', socket.id);
  
  // Test echo
  socket.emit('echo', { message: 'Hello from client' });
});

socket.on('echo', (data) => {
  console.log('✅ Echo response:', data);
  socket.disconnect();
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

运行测试：
```bash
node test-socket.js
```

**预期输出**：
```
✅ Connected to WebSocket server
Socket ID: abc123...
✅ Echo response: { message: 'Hello from client' }
Disconnected: io client disconnect
```

### 测试无效Token

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'invalid_token'
  }
});

socket.on('connect_error', (error) => {
  console.log('✅ Correctly rejected invalid token');
  console.log('Error:', error.message);
});
```

**预期输出**：
```
✅ Correctly rejected invalid token
Error: Authentication failed: Invalid or expired access token
```

## 完整测试流程

```bash
# 1. 注册新用户
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}' | jq

# 2. 登录获取token
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.refreshToken')

echo "Access Token: $ACCESS_TOKEN"
echo "Refresh Token: $REFRESH_TOKEN"

# 3. 测试认证端点
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 4. 测试token刷新
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" | jq

# 5. 登出
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq

# 6. 验证登出后refresh token失效
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}" | jq
```

## 验收标准检查表

- [ ] ✅ 可以成功注册新用户
- [ ] ✅ 可以使用正确的用户名密码登录
- [ ] ✅ 登录返回有效的JWT access token和refresh token
- [ ] ✅ 使用access token可以访问受保护的API端点
- [ ] ✅ Refresh token可以获取新的access token
- [ ] ✅ WebSocket连接需要有效access token才能建立
- [ ] ✅ 错误情况有适当的错误处理和返回
- [ ] ✅ 密码使用bcrypt加密存储
- [ ] ✅ 输入验证正常工作（邮箱格式、密码强度、用户名唯一性）
- [ ] ✅ 登录失败返回通用错误（不暴露用户是否存在）
