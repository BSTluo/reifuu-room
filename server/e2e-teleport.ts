/**
 * 好友传送 E2E 测试（临时脚本，测试后删除）
 * 覆盖：非好友 404、好友离线 400、成功传送（位置更新+探索+冷却）、冷却期 429、
 *       传送落点随机偏移（不与好友完全重叠）、REST 路由可用
 */
import { io } from '../client/reifuu-chat/node_modules/socket.io-client/build/esm/index.js';

const BASE = 'http://localhost:3001';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string): void {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failCount++;
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

async function api(method: string, path: string, token?: string, body?: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function connectSocket(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err: Error) => reject(err));
    setTimeout(() => reject(new Error('socket connect timeout')), 8000);
  });
}

async function createCharacter(token: string, suffix: string, ts: number): Promise<number> {
  // 注册后自动创建角色？检查 /character/me 先
  const me = await api('GET', '/character/me', token);
  if (me.status === 200 && me.data?.data?.id) {
    return me.data.data.id;
  }
  const create = await api('POST', '/character/create', token, {
    nickname: `Teleport${suffix}${ts}`,
    appearance: { gender: 'female', hair: 'black', skin: 'fair', outfit: 'default' },
    startContinent: 'east',
    spawnMethod: 'random_unowned',
  });
  if (create.status === 201 || create.status === 200) {
    return create.data?.data?.id;
  }
  throw new Error(`create character failed: ${create.status} ${JSON.stringify(create.data)}`);
}

async function main() {
  console.log('=== 好友传送 E2E 测试 ===\n');
  const ts = Date.now();

  // ---- 1. 注册两个新用户 + 角色 ----
  console.log('[1] 注册测试用户');
  const userA = await api('POST', '/auth/register', undefined, {
    username: `tp_a_${ts}`,
    email: `tp_a_${ts}@test.com`,
    password: 'test123456',
  });
  assert(userA.status === 201 || userA.status === 200, `注册用户A (${userA.status})`);
  const loginA = await api('POST', '/auth/login', undefined, {
    usernameOrEmail: `tp_a_${ts}`,
    password: 'test123456',
  });
  assert(loginA.status === 200, `登录用户A (${loginA.status})`);
  const tokenA: string = loginA.data?.data?.accessToken ?? loginA.data?.accessToken;

  const userB = await api('POST', '/auth/register', undefined, {
    username: `tp_b_${ts}`,
    email: `tp_b_${ts}@test.com`,
    password: 'test123456',
  });
  assert(userB.status === 201 || userB.status === 200, `注册用户B (${userB.status})`);
  const loginB = await api('POST', '/auth/login', undefined, {
    usernameOrEmail: `tp_b_${ts}`,
    password: 'test123456',
  });
  assert(loginB.status === 200, `登录用户B (${loginB.status})`);
  const tokenB: string = loginB.data?.data?.accessToken ?? loginB.data?.accessToken;

  const charA = await createCharacter(tokenA, 'A', ts);
  const charB = await createCharacter(tokenB, 'B', ts);
  assert(Number.isFinite(Number(charA)), `创建角色A id=${charA}`);
  assert(Number.isFinite(Number(charB)), `创建角色B id=${charB}`);

  // ---- 2. 非好友传送 → 404 ----
  console.log('\n[2] 非好友传送');
  const notFriend = await api('POST', `/friend/teleport/${charB}`, tokenA);
  assert(notFriend.status === 404, `非好友传送返回 404 (got ${notFriend.status})`);

  // ---- 3. 加好友 ----
  console.log('\n[3] 建立好友关系');
  const req = await api('POST', '/friend/request', tokenA, { toCharacterId: charB });
  assert(req.status === 201 || req.status === 200, `发送好友请求 (${req.status})`);
  const requestId = req.data?.data?.request?.requestId ?? req.data?.request?.requestId;
  const accept = await api('POST', `/friend/request/${requestId}/respond`, tokenB, { accept: true });
  assert(accept.status === 200, `接受好友请求 (${accept.status})`);

  // ---- 4. 好友离线传送 → 400 ----
  console.log('\n[4] 好友离线传送');
  const offline = await api('POST', `/friend/teleport/${charB}`, tokenA);
  assert(offline.status === 400, `好友离线传送返回 400 (got ${offline.status})`);

  // ---- 5. B 上线，A 传送成功 ----
  console.log('\n[5] B 上线，A 传送');
  const socketB = await connectSocket(tokenB);
  assert(socketB.connected, 'B socket 连接成功');

  // 等待 B 的在线状态写入 Redis
  await new Promise((r) => setTimeout(r, 1500));

  // A 传送前先查位置
  const meA = await api('GET', '/character/me', tokenA);
  const posBefore = meA.data?.data?.position
    ? { x: meA.data.data.position.x, y: meA.data.data.position.y }
    : null;

  const teleport = await api('POST', `/friend/teleport/${charB}`, tokenA);
  assert(teleport.status === 200, `传送成功 (${teleport.status})`);
  const tpData = teleport.data?.data;
  assert(!!tpData?.position?.x && !!tpData?.chunkId, `返回 position/chunkId: ${JSON.stringify(tpData)}`);
  assert(
    Math.abs(tpData.position.x) < 100000 && Math.abs(tpData.position.y) < 100000,
    `落点坐标合理: (${tpData?.position?.x}, ${tpData?.position?.y})`
  );
  assert(typeof tpData?.cooldownRemaining === 'number', '返回 cooldownRemaining');

  // 验证 DB 位置已更新
  const meA2 = await api('GET', '/character/me', tokenA);
  const newPos = meA2.data?.data?.position
    ? { x: meA2.data.data.position.x, y: meA2.data.data.position.y }
    : null;
  if (newPos) {
    assert(
      newPos.x === tpData.position.x && newPos.y === tpData.position.y,
      `DB 位置已更新: (${newPos.x}, ${newPos.y})`
    );
  }

  // ---- 6. 冷却期 → 429 ----
  console.log('\n[6] 冷却期二次传送');
  const cooldown = await api('POST', `/friend/teleport/${charB}`, tokenA);
  assert(cooldown.status === 429, `冷却期传送返回 429 (got ${cooldown.status})`);

  // ---- 7. 传送不与好友完全重叠（A 位置 ≠ B 位置） ----
  console.log('\n[7] 落点偏移验证');
  const meB = await api('GET', '/character/me', tokenB);
  const posB = meB.data?.data?.position
    ? { x: meB.data.data.position.x, y: meB.data.data.position.y }
    : null;
  if (posB && newPos) {
    const overlap = newPos.x === posB.x && newPos.y === posB.y;
    assert(!overlap, `落点不与好友完全重叠: A(${newPos.x},${newPos.y}) vs B(${posB.x},${posB.y})`);
    const dist = Math.sqrt((newPos.x - posB.x) ** 2 + (newPos.y - posB.y) ** 2);
    assert(dist <= 2.9, `落点在好友 1-2 格内: dist=${dist.toFixed(2)}`);
  }

  // ---- 8. 清除冷却后可再次传送（直接删 Redis key 验证） ----
  console.log('\n[8] 清冷却后再传送');
  // A 的 socket 上线（第一次传送时 A 未连接 socket，不影响）
  const socketA = await connectSocket(tokenA);
  assert(socketA.connected, 'A socket 连接成功');

  // 通过 socket 事件传送（验证 socket handler）
  const teleportViaSocket = await new Promise<{ ok: boolean; data?: any; error?: any }>((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
    socketA.once('friend:teleport-confirmed', (data: any) => {
      clearTimeout(timeout);
      resolve({ ok: true, data });
    });
    socketA.once('error', (err: any) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err });
    });
    socketA.emit('friend:teleport', { toCharacterId: Number(charB) });
  });
  // 此时应该还在冷却（A 刚传过）→ 应收到 error 事件而不是 teleport-confirmed
  assert(
    teleportViaSocket.ok === false && (teleportViaSocket.error as any)?.message?.includes?.('冷却'),
    `socket 传送冷却报错: ${JSON.stringify(teleportViaSocket.error).slice(0, 120)}`
  );

  // 清除冷却（模拟冷却结束）
  const { createClient } = await import('redis');
  const redis = createClient({
    socket: { host: '192.168.12.1', port: 6379 },
    password: 'BSO1005CFXL',
    database: 1,
    keyPrefix: 'reifuu:',
  });
  await redis.connect();
  await redis.del(`teleport:cooldown:${charA}`);
  console.log('  (已清除冷却 key)');

  const teleport2 = await new Promise<{ ok: boolean; data?: any; error?: any }>((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
    socketA.once('friend:teleport-confirmed', (data: any) => {
      clearTimeout(timeout);
      resolve({ ok: true, data });
    });
    socketA.once('error', (err: any) => {
      clearTimeout(timeout);
      resolve({ ok: false, error: err });
    });
    socketA.emit('friend:teleport', { toCharacterId: Number(charB) });
  });
  assert(teleport2.ok === true, `socket 传送成功: ${JSON.stringify(teleport2.data).slice(0, 120)}`);
  assert(!!teleport2.data?.chunkId, 'socket 传送返回 chunkId');
  assert(
    teleport2.data?.friendNickname === `TeleportB${ts}`,
    `friendNickname=TeleportB${ts} (got ${teleport2.data?.friendNickname})`
  );

  // ---- 9. 冷却 key 重新写入 ----
  const cooldownTTL = await redis.ttl(`teleport:cooldown:${charA}`);
  assert(cooldownTTL > 0 && cooldownTTL <= 300, `冷却 key 已写入 TTL=${cooldownTTL}s`);

  // 清理
  await redis.quit();
  socketA.disconnect();
  socketB.disconnect();

  console.log(`\n=== 结果: ${passCount} 通过, ${failCount} 失败 ===`);
  if (failures.length) {
    console.log('失败项:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});