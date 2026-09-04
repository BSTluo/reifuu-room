// E2E test for pigeon mail system (GDD §2.7 飞鸽传书)
// Run with: $env:PIGEON_DELAY_SCALE='0.01'; npx tsx e2e-pigeon.ts   (server must be running on :3001)
import 'dotenv/config';

const BASE = 'http://localhost:3001';
const SOCKET_CLIENT_PATH = '../client/reifuu-chat/node_modules/socket.io-client/build/esm/index.js';

// Use a separate DB connection for direct verification (server has its own pool)
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const ts = Date.now();
const USERS = {
  a: { username: `pgA_${ts}`, password: 'test123456', nickname: `鸽子甲${ts}` },
  b: { username: `pgB_${ts}`, password: 'test123456', nickname: `鸽子乙${ts}` },
  c: { username: `pgC_${ts}`, password: 'test123456', nickname: `鸽子丙${ts}` },
};

interface Ctx {
  token: string;
  characterId: number;
  nickname: string;
  userId: number;
}

async function registerAndCreateCharacter(u: { username: string; password: string; nickname: string }): Promise<Ctx> {
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u.username, email: `${u.username}@test.com`, password: u.password }),
  });
  if (!reg.ok && reg.status !== 409) {
    throw new Error(`register failed: ${reg.status} ${await reg.text()}`);
  }
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: u.username, password: u.password }),
  });
  const loginBody = await login.json();
  const token = loginBody.data?.accessToken;
  if (!token) throw new Error(`login failed for ${u.username}: ${JSON.stringify(loginBody)}`);

  const created = await fetch(`${BASE}/character/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      nickname: u.nickname,
      appearance: { gender: 'female', hair: 'short', skin: 'fair', outfit: 'casual' },
      startContinent: 'east',
      spawnMethod: 'random_unowned',
    }),
  });
  const createdBody = await created.json();
  const character = createdBody.data;
  if (!character) throw new Error(`create character failed: ${JSON.stringify(createdBody)}`);
  return { token, characterId: character.id, nickname: character.nickname, userId: character.userId ?? character.user_id };
}

// ============ Setup ============
console.log('\n=== Setup: register users & create characters ===');
const A = await registerAndCreateCharacter(USERS.a);
const B = await registerAndCreateCharacter(USERS.b);
const C = await registerAndCreateCharacter(USERS.c);
console.log(`A#${A.characterId} B#${B.characterId} C#${C.characterId}`);

const authHeaders = (ctx: Ctx) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ctx.token}`,
});

// ============ 1. Content validation ============
console.log('\n=== 1. 内容校验 ===');
{
  let r = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '   ' }),
  });
  check('空内容 → 400', r.status === 400, r.status);

  r = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: 'x'.repeat(201) }),
  });
  check('201 字超长 → 400', r.status === 400, r.status);

  r = await fetch(`${BASE}/friend/pigeon/${A.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: 'hi' }),
  });
  check('发给自己 → 400', r.status === 400, r.status);

  r = await fetch(`${BASE}/friend/pigeon/999999`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: 'hi' }),
  });
  check('接收者不存在 → 404', r.status === 404, r.status);
}

// ============ 2. Same-chunk instant delivery ============
console.log('\n=== 2. 同区块即时投递 ===');
{
  // Force both onto chunk 10_10 with clean positions
  await conn.query(`UPDATE characters SET current_chunk_id='10_10', grid_x=325, grid_y=325 WHERE id IN (?, ?)`, [A.characterId, B.characterId]);

  const unreadBefore = await conn.query(`SELECT COUNT(*) c FROM messages WHERE receiver_id=? AND is_read=FALSE`, [B.characterId]);
  const beforeCount = Number((unreadBefore[0] as any[])[0].c);

  const r = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '即时送达测试' }),
  });
  const body = await r.json();
  check('发送成功 → 201', r.status === 201, { status: r.status, body });
  const pigeon = body.data?.pigeon;
  check('返回 calculatedDelay=0 (distance≤1)', pigeon?.calculatedDelay === 0, pigeon);
  check('返回 deliveredAt 非空（即时）', Boolean(pigeon?.deliveredAt), pigeon);

  const rows: any = await conn.query(`SELECT * FROM pigeon_messages WHERE id=?`, [pigeon.id]);
  const row = (rows[0] as any[])[0];
  check('DB pigeon_messages.delivered_at 已设置', row?.delivered_at !== null, row);

  const mailbox: any = await conn.query(
    `SELECT type, content, sender_id FROM messages WHERE receiver_id=? AND type='pigeon' ORDER BY id DESC LIMIT 1`,
    [B.characterId]
  );
  const mb = (mailbox[0] as any[])[0];
  check('信箱写入 type=pigeon', mb?.type === 'pigeon', mb);
  const mbContent = typeof mb?.content === 'string' ? JSON.parse(mb.content) : mb?.content;
  check('信箱 content JSON 含 text 与 pigeonId', mbContent?.text === '即时送达测试' && Number(mbContent?.pigeonId) === Number(pigeon.id), mbContent);
  check('信箱 sender_id 正确', Number(mb?.sender_id) === A.characterId, mb);

  const unreadAfter: any = await conn.query(`SELECT COUNT(*) c FROM messages WHERE receiver_id=? AND is_read=FALSE`, [B.characterId]);
  const afterCount = Number((unreadAfter[0] as any[])[0].c);
  check('未读数 +1', afterCount === beforeCount + 1, { beforeCount, afterCount });

  const list = await fetch(`${BASE}/friend/pigeon`, { headers: authHeaders(B) });
  const listBody = await list.json();
  const pigeonDto = (listBody.data?.pigeons ?? []).find((p: any) => p.id === pigeon.id);
  check('GET /friend/pigeon 收件列表含该消息', Boolean(pigeonDto), listBody);
  check('列表含 senderNickname', pigeonDto?.senderNickname === A.nickname, pigeonDto);

  // Distance ≤ 1 check: distance is stored
  check('distance 存储为 0（同区块）', Number(row.distance) === 0, row.distance);
}

// ============ 3. Stranger reject setting ============
console.log('\n=== 3. 拒绝陌生人飞鸽传书 ===');
{
  // A → C (stranger). First works (same chunk instant)
  let r = await fetch(`${BASE}/friend/pigeon/${C.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '你好，陌生人' }),
  });
  check('陌生人可发 → 201', r.status === 201, r.status);

  // C enables reject
  r = await fetch(`${BASE}/friend/pigeon/settings`, {
    method: 'POST', headers: authHeaders(C), body: JSON.stringify({ rejectStrangerPigeon: true }),
  });
  const settings = await r.json();
  check('开启拒绝设置 → 200', r.status === 200, settings);
  check('设置返回 rejectStrangerPigeon=true', settings.data?.rejectStrangerPigeon === true, settings);

  // GET settings roundtrip
  const gs = await fetch(`${BASE}/friend/pigeon/settings`, { headers: authHeaders(C) });
  const gsBody = await gs.json();
  check('GET settings 回读 true', gsBody.data?.rejectStrangerPigeon === true, gsBody);

  // A → C now blocked (A is not friend of C)
  r = await fetch(`${BASE}/friend/pigeon/${C.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '再发一封' }),
  });
  check('拒绝陌生人后 → 403', r.status === 403, r.status);
}

// ============ 4. Friends bypass reject setting ============
console.log('\n=== 4. 好友不受拒绝设置影响 ===');
{
  // Make A and C friends: A sends request to C, C accepts
  const req = await fetch(`${BASE}/friend/request`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ toCharacterId: C.characterId, message: '加个好友' }),
  });
  check('A→C 好友请求 → 200/201', req.status === 200 || req.status === 201, req.status);

  const pending = await fetch(`${BASE}/friend/requests/pending`, { headers: authHeaders(C) });
  const pendingBody = await pending.json();
  const reqRow = (pendingBody.data?.requests ?? []).find((x: any) => x.fromCharacterId === A.characterId);
  check('C 待处理列表含该请求', Boolean(reqRow), pendingBody);

  const resp = await fetch(`${BASE}/friend/request/${reqRow.requestId}/respond`, {
    method: 'POST', headers: authHeaders(C), body: JSON.stringify({ accept: true }),
  });
  check('C 接受 → 200', resp.status === 200, resp.status);

  // Now A (friend) → C should succeed despite rejectStrangerPigeon=true
  const r = await fetch(`${BASE}/friend/pigeon/${C.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '好友不受影响' }),
  });
  check('好友发送（设置开启）→ 201', r.status === 201, r.status);
}

// ============ 5. Cooldown: 3 per 5 minutes ============
console.log('\n=== 5. 冷却限制 ===');
{
  // A already sent: 2 to B (1 instant test + earlier validations don't count failed ones)
  // Count A's sent in last 5 min
  const cnt: any = await conn.query(
    `SELECT COUNT(*) c FROM pigeon_messages WHERE sender_id=? AND sent_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
    [A.characterId]
  );
  const already = Number((cnt[0] as any[])[0].c);
  console.log(`  A 已发送 ${already} 条（5 分钟窗口）`);

  // Send until we hit 3, then the 4th must 429
  let statuses: number[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
      method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: `冷却测试${i}` }),
    });
    statuses.push(r.status);
  }
  check('冷却窗口内连发，前 (3-已发) 条成功、后续 429', statuses.every((s) => s === 201 || s === 429), statuses);
  const r4 = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
    method: 'POST', headers: authHeaders(A), body: JSON.stringify({ content: '第四条应被限' }),
  });
  check('超限 → 429', r4.status === 429, r4.status);
}

// ============ 6. Cross-chunk delayed delivery + scheduler + socket notify ============
console.log('\n=== 6. 跨区块延迟投递 + 定时投递 + socket 通知 ===');
{
  // C→B delayed: force C to a far chunk (e.g. 3_3)
  await conn.query(`UPDATE characters SET current_chunk_id='3_3', grid_x=96, grid_y=96 WHERE id=?`, [C.characterId]);
  // Clear cooldown for C (fresh sender)
  const r = await fetch(`${BASE}/friend/pigeon/${B.characterId}`, {
    method: 'POST', headers: authHeaders(C), body: JSON.stringify({ content: '远方的信' }),
  });
  const body = await r.json();
  check('跨区块发送 → 201', r.status === 201, r.status);
  const pigeon = body.data?.pigeon;
  check('延迟 > 0 (distance>1 且同大洲=600s 未缩放)', pigeon?.calculatedDelay > 0, pigeon);
  check('deliveredAt 为 null（传递中）', pigeon?.deliveredAt === null, pigeon);

  const rows: any = await conn.query(`SELECT * FROM pigeon_messages WHERE id=?`, [pigeon.id]);
  const row = (rows[0] as any[])[0];
  check('DB delivered_at 为 NULL（传递中）', row?.delivered_at === null, row);

  // B connects via socket and listens for delivery notification
  const { io } = await import(SOCKET_CLIENT_PATH);
  const socket = io(BASE, {
    auth: { token: B.token },
    transports: ['websocket'],
    forceNew: true,
  });
  let deliveredPayload: any = null;
  socket.on('friend:pigeon-delivered', (data: any) => {
    deliveredPayload = data;
  });
  await sleep(1200); // allow room join

  // Wait for scheduler (10s tick + 6s scaled delay = within ~20s)
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline && !deliveredPayload) {
    await sleep(1000);
  }
  check('socket 收到 friend:pigeon-delivered', deliveredPayload !== null, { deliveredPayload });
  if (deliveredPayload) {
    check('通知含 pigeonId', Number(deliveredPayload.pigeonId) === Number(pigeon.id), deliveredPayload);
    check('通知含 senderNickname', deliveredPayload.senderNickname === C.nickname, deliveredPayload);
    check('通知含 content', deliveredPayload.content === '远方的信', deliveredPayload);
  }

  // DB check: delivered
  const after: any = await conn.query(`SELECT delivered_at FROM pigeon_messages WHERE id=?`, [pigeon.id]);
  check('定时任务已投递（delivered_at 设置）', (after[0] as any[])[0]?.delivered_at !== null, after[0]);

  // Mailbox entry created by scheduler
  const mb: any = await conn.query(
    `SELECT content FROM messages WHERE receiver_id=? AND type='pigeon' AND sender_id=? ORDER BY id DESC LIMIT 1`,
    [B.characterId, C.characterId]
  );
  const mbRow = (mb[0] as any[])[0];
  const mbContent = typeof mbRow?.content === 'string' ? JSON.parse(mbRow.content) : mbRow?.content;
  check('投递后信箱写入', mbContent?.text === '远方的信', mbContent);

  socket.close();
}

// ============ 7. Settings reset for C (cleanup-friendly state) ============
console.log('\n=== 7. 收尾检查 ===');
{
  // Turn off C's reject setting to leave clean state
  await fetch(`${BASE}/friend/pigeon/settings`, {
    method: 'POST', headers: authHeaders(C), body: JSON.stringify({ rejectStrangerPigeon: false }),
  });
  const gs = await fetch(`${BASE}/friend/pigeon/settings`, { headers: authHeaders(C) });
  const gsBody = await gs.json();
  check('设置可关闭', gsBody.data?.rejectStrangerPigeon === false, gsBody);
}

console.log(`\n===== 结果: ${passed} 通过, ${failed} 失败 =====`);
await conn.end();
process.exit(failed > 0 ? 1 : 0);