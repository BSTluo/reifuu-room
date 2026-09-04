/**
 * Friend system E2E test (GDD §2.7).
 * Runs against the DB directly via FriendService + a REST round-trip on port 3001.
 * Usage: PORT=3001 server must be running; this script tests the service layer + REST API.
 */
import { query } from './src/db/mysql.js';
import pool from './src/db/mysql.js';
import { createClient } from 'redis';
import FriendService from './src/services/FriendService.js';
import { AppError } from './src/middleware/errorHandler.js';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}`);
  }
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, name: string): Promise<void> {
  try {
    await promise;
    assert(false, `${name} (expected AppError ${statusCode}, got success)`);
  } catch (err: any) {
    const ok = err instanceof AppError && err.statusCode === statusCode;
    assert(ok, `${name} (got ${err?.statusCode ?? 'non-AppError'}: ${err?.message})`);
  }
}

// ---- REST helpers ----
async function rest(method: string, path: string, token?: string, body?: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function registerAndLogin(username: string): Promise<{ token: string; userId: string; characterId: number }> {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const uname = `${username}_${suffix}`;
  const email = `${uname}@test.com`;
  const password = 'testpass123';

  await rest('POST', '/auth/register', undefined, { username: uname, email, password });
  const login = await rest('POST', '/auth/login', undefined, { usernameOrEmail: uname, password });
  const token = login.data?.data?.accessToken;

  // create a character for this user
  const createRes = await rest(
    'POST',
    '/character/create',
    token,
    { nickname: `昵称_${suffix}`, appearance: { gender: 'male', hair: 'black', skin: 'fair', outfit: 'casual' }, startContinent: 'east', spawnMethod: 'random_unowned' }
  );
  const characterId = createRes.data?.data?.id;

  return { token, userId: login.data?.data?.user?.id, characterId };
}

async function main(): Promise<void> {
  console.log('=== Friend system E2E ===\n');

  // Ensure server is reachable
  try {
    const health = await fetch(`${BASE}/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch {
    console.error(`Server not reachable at ${BASE}. Start it first: cd server; $env:PORT='3001'; npm run dev`);
    process.exit(1);
  }

  // Create two test users with characters
  console.log('[setup] creating two test accounts...');
  const userA = await registerAndLogin('frienda');
  const userB = await registerAndLogin('friendb');
  assert(typeof userA.characterId === 'number' && typeof userB.characterId === 'number', 'two characters created');
  const cidA: number = userA.characterId;
  const cidB: number = userB.characterId;

  // Clean any pre-existing friend data between these two (safety)
  await query('DELETE FROM friendships WHERE (character_id_1 = ? AND character_id_2 = ?) OR (character_id_1 = ? AND character_id_2 = ?)', [Math.min(cidA,cidB), Math.max(cidA,cidB), Math.min(cidA,cidB), Math.max(cidA,cidB)]);
  await query('DELETE FROM friend_requests WHERE (from_character_id = ? AND to_character_id = ?) OR (from_character_id = ? AND to_character_id = ?)', [cidA, cidB, cidB, cidA]);
  await query('DELETE FROM messages WHERE receiver_id IN (?, ?)', [cidA, cidB]);

  console.log('\n[1] REST: send friend request A -> B');
  {
    const res = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidB, message: '交个朋友吧' });
    assert(res.status === 201, `A sends request (status ${res.status})`);
    assert(res.data?.data?.request?.fromCharacterId === cidA, 'request response has fromCharacterId');
    assert(res.data?.data?.request?.message === '交个朋友吧', 'request message preserved');
    const requestId = res.data?.data?.request?.requestId;

    console.log('\n[2] REST: duplicate request rejected');
    const dup = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidB });
    assert(dup.status === 409, `duplicate pending request rejected (status ${dup.status})`);

    console.log('\n[3] REST: reverse request also rejected (pending exists)');
    const rev = await rest('POST', '/friend/request', userB.token, { toCharacterId: cidA });
    assert(rev.status === 409, `reverse pending rejected (status ${rev.status})`);

    console.log('\n[4] REST: self request rejected');
    const selfReq = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidA });
    assert(selfReq.status === 400, `self request rejected (status ${selfReq.status})`);

    console.log('\n[5] REST: B sees pending request');
    const pend = await rest('GET', '/friend/requests/pending', userB.token);
    assert(pend.status === 200, `B fetch pending (status ${pend.status})`);
    assert(Array.isArray(pend.data?.data?.requests) && pend.data.data.requests.length === 1, 'B has exactly 1 pending');
    assert(pend.data?.data?.requests?.[0]?.fromCharacterId === cidA, 'pending from A');
    assert(pend.data?.data?.requests?.[0]?.fromNickname?.startsWith('昵称_'), 'pending has nickname');

    console.log('\n[6] REST: B mailbox contains friend_request message');
    const mailbox = await rest('GET', '/friend/mailbox', userB.token);
    assert(mailbox.status === 200, 'B fetch mailbox');
    const friendMsgs = (mailbox.data?.data?.messages ?? []).filter((m: any) => m.type === 'friend_request');
    assert(friendMsgs.length === 1, 'mailbox has 1 friend_request message');
    assert(friendMsgs[0]?.isRead === false, 'message unread');

    const unread = await rest('GET', '/friend/mailbox/unread-count', userB.token);
    assert(unread.data?.data?.count === 1, `unread count is 1 (got ${unread.data?.data?.count})`);

    console.log('\n[7] REST: A cannot respond to the request (only B can)');
    const wrongRespond = await rest('POST', `/friend/request/${requestId}/respond`, userA.token, { accept: true });
    assert(wrongRespond.status === 403, `A respond rejected (status ${wrongRespond.status})`);

    console.log('\n[8] REST: B accepts the request -> friendship created');
    const accept = await rest('POST', `/friend/request/${requestId}/respond`, userB.token, { accept: true });
    assert(accept.status === 200, `B accepts (status ${accept.status})`);
    assert(accept.data?.data?.status === 'accepted', 'status accepted');

    console.log('\n[9] REST: both see each other in friend list');
    const listA = await rest('GET', '/friend/list', userA.token);
    const listB = await rest('GET', '/friend/list', userB.token);
    assert(listA.data?.data?.friends?.length === 1 && listA.data.data.friends[0].characterId === cidB, 'A sees B');
    assert(listB.data?.data?.friends?.length === 1 && listB.data.data.friends[0].characterId === cidA, 'B sees A');
    assert(typeof listA.data?.data?.friends?.[0]?.isOnline === 'boolean', 'friend has isOnline field');

    console.log('\n[10] REST: respond twice rejected');
    const reRespond = await rest('POST', `/friend/request/${requestId}/respond`, userB.token, { accept: true });
    assert(reRespond.status === 409, `re-respond rejected (status ${reRespond.status})`);

    console.log('\n[11] REST: A mailbox has accepted system message');
    const mailboxA = await rest('GET', '/friend/mailbox', userA.token);
    const sysMsgs = (mailboxA.data?.data?.messages ?? []).filter((m: any) => m.type === 'system');
    assert(sysMsgs.length === 1 && sysMsgs[0].content?.text === '你的好友请求已被接受', 'A has acceptance system message');

    console.log('\n[12] REST: friend request to existing friend rejected');
    const reReq = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidB });
    assert(reReq.status === 409, `request to friend rejected (status ${reReq.status})`);

    console.log('\n[13] REST: mark mailbox message read');
    const msgId = friendMsgs[0]?.id;
    if (msgId) {
      const mark = await rest('POST', `/friend/mailbox/${msgId}/read`, userB.token);
      assert(mark.status === 200, 'mark read succeeds');
      const unread2 = await rest('GET', '/friend/mailbox/unread-count', userB.token);
      assert(unread2.data?.data?.count === 0, `unread count now 0 (got ${unread2.data?.data?.count})`);
    } else {
      assert(false, 'mark read: no message id');
    }

    console.log('\n[14] REST: remove friend');
    const del = await rest('DELETE', `/friend/${cidB}`, userA.token);
    assert(del.status === 200, `A removes B (status ${del.status})`);
    const listA2 = await rest('GET', '/friend/list', userA.token);
    const listB2 = await rest('GET', '/friend/list', userB.token);
    assert((listA2.data?.data?.friends ?? []).length === 0, 'A friend list empty');
    assert((listB2.data?.data?.friends ?? []).length === 0, 'B friend list empty');

    console.log('\n[15] REST: remove non-friend rejected');
    const del2 = await rest('DELETE', `/friend/${cidB}`, userA.token);
    assert(del2.status === 404, `remove non-friend rejected (status ${del2.status})`);

    console.log('\n[16] REST: rejection flow (B rejects)');
    const req2 = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidB });
    const requestId2 = req2.data?.data?.request?.requestId;
    assert(req2.status === 201, 'second request created');
    const reject = await rest('POST', `/friend/request/${requestId2}/respond`, userB.token, { accept: false });
    assert(reject.status === 200 && reject.data?.data?.status === 'rejected', 'B rejects');
    const listA3 = await rest('GET', '/friend/list', userA.token);
    assert((listA3.data?.data?.friends ?? []).length === 0, 'no friendship after rejection');

    // Rejected request should not block a new one
    const req3 = await rest('POST', '/friend/request', userA.token, { toCharacterId: cidB });
    assert(req3.status === 201, 'new request allowed after rejection');

    console.log('\n[17] Service: friend limit check uses count');
    {
      const count = await FriendService.getFriendCount(cidA);
      assert(count === 0, `getFriendCount returns 0 (got ${count})`);
    }

    console.log('\n[18] Redis: online status set format');
    {
      try {
        const standalone = createClient({ socket: { host: '192.168.12.1', port: 6379 }, password: 'BSO1005CFXL', database: 1 });
        await standalone.connect();
        const key = 'reifuu:online:characters';
        const addRes = await standalone.sAdd(key, String(cidA));
        console.log(`  (sAdd returned ${JSON.stringify(addRes)})`);
        const isMember = await standalone.sIsMember(key, String(cidA));
        console.log(`  (sIsMember returned ${JSON.stringify(isMember)})`);
        assert(Boolean(isMember) === true, 'character can be added to online set');
        await standalone.sRem(key, String(cidA));
        const isMemberAfter = await standalone.sIsMember(key, String(cidA));
        assert(Boolean(isMemberAfter) === false, 'character removed from online set');
        await standalone.quit();
      } catch (e: any) {
        console.log(`  (Redis error: ${e?.message})`);
        assert(false, `Redis connection/operation failed: ${e?.message}`);
      }
    }

    console.log('\n[19] Cleanup test data');
    await query('DELETE FROM friend_requests WHERE from_character_id IN (?, ?) OR to_character_id IN (?, ?)', [cidA, cidB, cidA, cidB]);
    await query('DELETE FROM messages WHERE receiver_id IN (?, ?)', [cidA, cidB]);
    // friendships already deleted by removeFriend tests
    console.log('  ✓ test rows cleaned');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length) {
    console.log('Failed checks:');
    for (const f of failures) console.log('  - ' + f);
  }
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('E2E crashed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});