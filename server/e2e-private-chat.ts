/**
 * 好友私聊频道 E2E 测试（GDD §2.7 好友私聊频道）
 * 运行：npx tsx e2e-private-chat.ts
 */
import { io } from '../client/reifuu-chat/node_modules/socket.io-client/build/esm/index.js';

const BASE = `http://localhost:${process.env.PORT ?? 3001}`;
const API = BASE;

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ApiResp {
  status: string;
  data?: any;
  message?: string;
}

async function api(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; json: ApiResp }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResp;
  return { status: res.status, json };
}

async function registerAndLogin(prefix: string): Promise<{ token: string; characterId: number; nickname: string }> {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const email = `${username}@test.com`;
  const password = 'Test1234!';

  const reg = await api('POST', '/auth/register', undefined, { username, email, password });
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  }

  const login = await api('POST', '/auth/login', undefined, { usernameOrEmail: username, password });
  if (login.status !== 200 || !login.json.data?.accessToken) {
    throw new Error(`login failed: ${login.status} ${JSON.stringify(login.json)}`);
  }
  const token = login.json.data.accessToken as string;

  const nickname = `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const create = await api('POST', '/character/create', token, {
    nickname,
    appearance: { gender: 'female', hair: 'short', skin: 'fair', outfit: 'casual' },
    startContinent: 'east',
    spawnMethod: 'random_unowned',
  });
  if (create.status !== 201 && create.status !== 200) {
    throw new Error(`character create failed: ${create.status} ${JSON.stringify(create.json)}`);
  }
  const characterId = Number(create.json.data.id);

  return { token, characterId, nickname };
}

async function waitForEvent<T = any>(
  socket: any,
  event: string,
  timeoutMs = 5000,
  predicate?: (data: T) => boolean
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for event: ${event}`));
    }, timeoutMs);
    const handler = (data: T) => {
      if (predicate && !predicate(data)) return; // keep waiting
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

async function main() {
  console.log('=== 好友私聊频道 E2E 测试 ===\n');

  // ---- 准备：两个用户成为好友 ----
  console.log('[Setup] 注册并创建角色…');
  const A = await registerAndLogin('pca');
  const B = await registerAndLogin('pcb');
  const C = await registerAndLogin('pcc'); // 非好友
  console.log(`  A=${A.characterId}(${A.nickname}) B=${B.characterId}(${B.nickname}) C=${C.characterId}(${C.nickname})`);

  // A → B 好友请求
  const reqResp = await api('POST', '/friend/request', A.token, { toCharacterId: B.characterId, message: 'pm test' });
  ok('A 发送好友请求 201', reqResp.status === 201, `status=${reqResp.status}`);

  const pending = await api('GET', '/friend/requests/pending', B.token);
  const request = pending.json.data?.requests?.find((r: any) => r.fromCharacterId === A.characterId);
  ok('B 查看到 pending 请求', !!request);

  const accept = await api('POST', `/friend/request/${request.requestId}/respond`, B.token, { accept: true });
  ok('B 接受好友请求', accept.status === 200, `status=${accept.status}`);

  // ---- 1. Socket 连接 ----
  console.log('\n[1] 建立_SOCKET 连接…');
  const socketA = io(BASE, { auth: { token: A.token }, transports: ['websocket'] });
  const socketB = io(BASE, { auth: { token: B.token }, transports: ['websocket'] });
  const socketC = io(BASE, { auth: { token: C.token }, transports: ['websocket'] });

  await Promise.all([
    new Promise<void>((r) => socketA.on('connect', () => r())),
    new Promise<void>((r) => socketB.on('connect', () => r())),
    new Promise<void>((r) => socketC.on('connect', () => r())),
  ]);
  // 等待异步 setup（character 房间加入、上线标记）
  await sleep(1200);
  console.log('  已连接 A/B/C');

  // ---- 2. 非好友发送 → 错误事件 ----
  console.log('\n[2] 非好友私聊应报错');
  const errPromise = new Promise<string>((resolve) => {
    socketC.once('error', (data: any) => resolve(data?.message ?? ''));
  });
  socketC.emit('friend:send-message', { toCharacterId: A.characterId, content: 'stranger msg' });
  const errMsg = await errPromise;
  ok('非好友发送收到 error 事件', errMsg.includes('好友'), `message="${errMsg}"`);

  // ---- 3. 空内容 / 超长内容 ----
  console.log('\n[3] 内容校验');
  const errEmpty = new Promise<string>((resolve) => {
    socketA.once('error', (data: any) => resolve(data?.message ?? ''));
  });
  socketA.emit('friend:send-message', { toCharacterId: B.characterId, content: '   ' });
  const emptyMsg = await errEmpty;
  ok('空内容报错', emptyMsg.includes('不能为空'), `message="${emptyMsg}"`);

  const errLong = new Promise<string>((resolve) => {
    socketA.once('error', (data: any) => resolve(data?.message ?? ''));
  });
  socketA.emit('friend:send-message', { toCharacterId: B.characterId, content: 'x'.repeat(201) });
  const longMsg = await errLong;
  ok('超 200 字报错', longMsg.includes('200'), `message="${longMsg}"`);

  // ---- 4. A → B 实时送达 ----
  console.log('\n[4] A→B 实时消息');
  const receivedByB = new Promise<any>((resolve) => {
    socketB.once('friend:message-received', (data: any) => resolve(data));
  });
  const ackToA = new Promise<any>((resolve) => {
    socketA.once('friend:message-sent', (data: any) => resolve(data));
  });

  socketA.emit('friend:send-message', { toCharacterId: B.characterId, content: '你好，B！' });

  const recv = await receivedByB;
  const ack = await ackToA;

  ok('B 收到 friend:message-received', !!recv?.message);
  ok('senderId = A', recv?.message?.senderId === A.characterId, `got ${recv?.message?.senderId}`);
  ok('receiverId = B', recv?.message?.receiverId === B.characterId, `got ${recv?.message?.receiverId}`);
  ok('content.text = 消息正文', recv?.message?.content?.text === '你好，B！', JSON.stringify(recv?.message?.content));
  ok('senderNickname = A 昵称', recv?.message?.senderNickname === A.nickname, `got ${recv?.message?.senderNickname}`);
  ok('A 收到 friend:message-sent 回执', !!ack?.message);
  ok('回执 id 与 B 收到一致', ack?.message?.id === recv?.message?.id);

  // ---- 5. B → A 回复 ----
  console.log('\n[5] B→A 回复');
  const receivedByA = new Promise<any>((resolve) => {
    socketA.once('friend:message-received', (data: any) => resolve(data));
  });
  socketB.emit('friend:send-message', { toCharacterId: A.characterId, content: '你好呀 A！' });
  const recvA = await receivedByA;
  ok('A 实时收到 B 的回复', recvA?.message?.content?.text === '你好呀 A！', JSON.stringify(recvA?.message?.content));

  // ---- 6. 历史记录（REST） ----
  console.log('\n[6] 历史记录');
  const histA = await api('GET', `/friend/messages/${B.characterId}`, A.token);
  ok('A 拉取会话历史 200', histA.status === 200, `status=${histA.status}`);
  const histAmsgs = histA.json.data?.messages ?? [];
  ok('历史含 2 条消息', histAmsgs.length === 2, `got ${histAmsgs.length}`);
  ok('按时间正序（最旧在前）', histAmsgs.length === 2 && histAmsgs[0].content?.text === '你好，B！' && histAmsgs[1].content?.text === '你好呀 A！');
  ok('消息含 senderNickname', histAmsgs.every((m: any) => !!m.senderNickname));

  const histB = await api('GET', `/friend/messages/${A.characterId}`, B.token);
  ok('B 拉取同一会话历史', (histB.json.data?.messages ?? []).length === 2, `got ${(histB.json.data?.messages ?? []).length}`);

  // ---- 7. 已读标记 ----
  console.log('\n[7] 已读标记');
  const unreadBefore = (await api('GET', '/friend/mailbox/unread-count', B.token)).json.data?.count ?? 0;
  const markRead = await api('POST', `/friend/messages/${A.characterId}/read`, B.token);
  ok('标记会话已读 200', markRead.status === 200, `status=${markRead.status}`);
  const unreadAfter = (await api('GET', '/friend/mailbox/unread-count', B.token)).json.data?.count ?? 0;
  ok('未读数减少 1（B 收到的那条）', unreadBefore - unreadAfter === 1, `before=${unreadBefore} after=${unreadAfter}`);

  const histB2 = await api('GET', `/friend/messages/${A.characterId}`, B.token);
  const msgsB2 = histB2.json.data?.messages ?? [];
  const msgFromA = msgsB2.find((m: any) => m.senderId === A.characterId);
  const msgFromB = msgsB2.find((m: any) => m.senderId === B.characterId);
  ok('B 视角：来自 A 的消息 isRead=true', msgFromA?.isRead === true, JSON.stringify(msgFromA?.isRead));
  ok('B 视角：自己发的消息 isRead=false（对方未读）', msgFromB?.isRead === false, JSON.stringify(msgFromB?.isRead));

  // ---- 8. 持久化验证（断线重连后历史仍在） ----
  console.log('\n[8] 持久化');
  socketA.disconnect();
  await sleep(300);
  const socketA2 = io(BASE, { auth: { token: A.token }, transports: ['websocket'] });
  await new Promise<void>((r) => socketA2.on('connect', () => r()));
  await sleep(1000);
  const histA2 = await api('GET', `/friend/messages/${B.characterId}`, A.token);
  ok('重连后历史仍可查（持久化）', (histA2.json.data?.messages ?? []).length === 2, `got ${(histA2.json.data?.messages ?? []).length}`);

  // ---- 清理 ----
  socketA2.disconnect();
  socketB.disconnect();
  socketC.disconnect();

  console.log(`\n=== 结果: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});