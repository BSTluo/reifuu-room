# 登录跳过Bug修复说明

## 问题描述
用户打开网页后直接进入创建角色页面，没有经过登录页面。

## 根本原因

**Token持久化机制导致的自动登录**：

1. `userStore`在初始化时从localStorage读取token：
   ```typescript
   accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
   ```

2. `isAuthenticated`判断只基于token是否存在：
   ```typescript
   isAuthenticated: (state) => !!state.accessToken,
   ```

3. 如果localStorage中有旧token（即使可能已失效），用户就会被认为已登录

4. `App.vue`的`onMounted`检测到`isAuthenticated=true`后自动加载角色信息

## 可能的场景

### 场景1：Token失效但仍在localStorage
- 用户之前登录过，token保存在localStorage
- Token已过期或被后端废除
- 前端仍认为用户已登录，尝试加载角色
- 如果API调用失败，characterStore可能返回`hasCharacter=false`
- 用户看到创建角色页面而非登录页面

### 场景2：正常的自动登录
- 用户之前登录过，token仍然有效
- 但用户还没创建角色
- 前端正确地显示创建角色页面

## 解决方案

### 方案1：Token验证（推荐）
在App.vue加载时验证token的有效性：
```typescript
onMounted(async () => {
  if (userStore.isAuthenticated) {
    try {
      await loadCharacter()
    } catch (error) {
      // Token无效，清除并返回登录页
      if (error.status === 401) {
        userStore.logout()
      }
    }
  }
})
```

### 方案2：添加退出按钮
在创建角色页面添加"退出登录"按钮，让用户能返回登录页面

### 方案3：清除本地存储
如果是测试环境，可以手动清除localStorage：
```javascript
// 在浏览器控制台执行
localStorage.clear()
location.reload()
```

## 需要用户确认的信息

1. **您是否之前登录过这个账号？**
   - 如果是：这可能是正常的自动登录功能
   - 如果否：需要清除旧的token数据

2. **您是想创建新角色还是登录现有账号？**
   - 创建新角色：当前页面是正确的
   - 登录现有账号：需要先退出当前会话

3. **浏览器控制台是否有错误信息？**
   - 打开F12开发者工具查看Console标签
   - 如果有401/403错误，说明token已失效

## 临时解决方法

**立即清除登录状态**：
1. 打开浏览器开发者工具（F12）
2. 切换到Console（控制台）标签
3. 输入以下命令并回车：
   ```javascript
   localStorage.removeItem('reifuu.accessToken')
   localStorage.removeItem('reifuu.refreshToken')
   location.reload()
   ```
4. 页面刷新后应该会显示登录界面
