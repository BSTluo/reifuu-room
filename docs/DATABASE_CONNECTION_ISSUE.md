# 登录500错误 - 数据库连接问题

## 问题诊断

### 症状
- 登录请求响应时间很长（10秒+）
- 返回500错误："Login failed"
- 数据库连接超时

### 根本原因
**数据库服务器无法访问**

当前配置：
```
DB_HOST=192.168.12.1
REDIS_HOST=192.168.12.1
```

Ping测试结果：192.168.12.1 无响应（100%丢包）

这意味着MySQL和Redis服务器无法连接，导致所有需要数据库的操作失败。

## 解决方案

### 方案1：启动远程数据库服务器（推荐，如果192.168.12.1是您的数据库服务器）

如果192.168.12.1是您专门的数据库服务器：

1. **登录到192.168.12.1服务器**
2. **启动MySQL服务**：
   ```bash
   # Linux
   sudo systemctl start mysql
   sudo systemctl status mysql
   
   # Windows
   net start MySQL
   ```

3. **启动Redis服务**：
   ```bash
   # Linux
   sudo systemctl start redis
   sudo systemctl status redis
   
   # Windows
   net start Redis
   ```

4. **验证服务运行**：
   ```bash
   # 测试MySQL
   mysql -h 192.168.12.1 -u reifuu-chat -p
   
   # 测试Redis
   redis-cli -h 192.168.12.1 ping
   ```

5. **检查防火墙**：
   ```bash
   # 确保端口3306(MySQL)和6379(Redis)开放
   ```

### 方案2：使用本地数据库（快速测试方案）

如果您想在本地运行所有服务：

#### 2.1 安装本地MySQL和Redis

**Windows**:
- MySQL: https://dev.mysql.com/downloads/installer/
- Redis: https://github.com/microsoftarchive/redis/releases

**Linux**:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mysql-server redis-server

# 启动服务
sudo systemctl start mysql redis
```

#### 2.2 配置本地数据库

1. **创建MySQL数据库和用户**：
```sql
mysql -u root -p

CREATE DATABASE `reifuu-chat`;
CREATE USER 'reifuu-chat'@'localhost' IDENTIFIED BY 'e52Bn6spjiWLszMD';
GRANT ALL PRIVILEGES ON `reifuu-chat`.* TO 'reifuu-chat'@'localhost';
FLUSH PRIVILEGES;
```

2. **导入数据库结构**：
```bash
mysql -u reifuu-chat -p reifuu-chat < database/schema.sql
```

#### 2.3 修改.env配置

编辑 `server/.env`：
```env
DB_HOST=localhost
# 或使用 127.0.0.1
# DB_HOST=127.0.0.1

REDIS_HOST=localhost
# 或使用 127.0.0.1
# REDIS_HOST=127.0.0.1
```

#### 2.4 重启后端服务

```bash
cd server
# 停止当前进程（如果在运行）
# Windows: Ctrl+C 或使用任务管理器

# 重新启动
npm run dev
```

### 方案3：使用Docker（最简单的方式）

如果您安装了Docker：

1. **创建docker-compose.yml**（在项目根目录）：
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: reifuu-chat
      MYSQL_USER: reifuu-chat
      MYSQL_PASSWORD: e52Bn6spjiWLszMD
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass BSO1005CFXL
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  mysql_data:
  redis_data:
```

2. **启动服务**：
```bash
docker-compose up -d
```

3. **修改server/.env**：
```env
DB_HOST=localhost
REDIS_HOST=localhost
```

4. **导入数据库结构**：
```bash
docker exec -i $(docker-compose ps -q mysql) mysql -ureifuu-chat -pe52Bn6spjiWLszMD reifuu-chat < database/schema.sql
```

## 验证修复

修复后，测试连接：

```bash
# 测试登录API
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail":"test","password":"test123"}'
```

应该在1-2秒内得到响应（不是10秒）。

## 当前状态

- ❌ 数据库服务器 (192.168.12.1) 无法访问
- ❌ 所有数据库操作失败
- ⚠️ 后端服务运行但无法处理请求

## 下一步

**请选择一个方案并执行**，然后重新测试登录功能。
