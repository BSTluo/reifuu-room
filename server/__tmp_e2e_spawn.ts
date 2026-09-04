/* End-to-end verification of the spawn point selection system (GDD §2.1).
 * Registers fresh users, fetches spawn options, creates characters with both
 * spawn methods, and verifies DB state. Run: npx tsx __tmp_e2e_spawn.ts
 */
const BASE = process.env.E2E_BASE ?? 'http://localhost:3001';

interface Json { status: string; data?: any; message?: string }

async function post(path: string, body?: any, token?: string): Promise<{ code: number; body: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { code: res.status, body: await res.json().catch(() => ({})) };
}

async function get(path: string, token?: string): Promise<{ code: number; body: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { code: res.status, body: await res.json().catch(() => ({})) };
}

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

const stamp = Date.now().toString(36);

async function register(username: string): Promise<string> {
  const reg = await post('/auth/register', { username, email: `${username}@test.local`, password: 'test123456' });
  if (reg.code !== 201 && reg.code !== 200) {
    // already registered? try login
    const login = await post('/auth/login', { usernameOrEmail: username, password: 'test123456' });
    assert(login.code === 200, `login ${username}`);
    return login.body.data.accessToken;
  }
  const login = await post('/auth/login', { usernameOrEmail: username, password: 'test123456' });
  assert(login.code === 200, `login ${username}`);
  return login.body.data.accessToken;
}

async function main() {
  // 1. spawn options endpoint
  const tokenA = await register(`sp_unowned_${stamp}`);
  const options = await get('/character/spawn-options', tokenA);
  assert(options.code === 200, 'GET /character/spawn-options returns 200');
  assert(
    Array.isArray(options.body.data) &&
      options.body.data.length === 2 &&
      options.body.data[0].method === 'random_unowned' &&
      options.body.data[1].method === 'random_public',
    'spawn options contain both methods with pool sizes'
  );
  console.log('   options:', JSON.stringify(options.body.data?.map((o: any) => `${o.method}:${o.poolSize}`)));

  // 2. create character with random_unowned
  const createA = await post('/character/create', {
    nickname: `孤狼${stamp}`,
    appearance: { gender: 'male', hair: 'short', skin: 'fair', outfit: 'villager' },
    startContinent: 'east',
    spawnMethod: 'random_unowned',
  }, tokenA);
  assert(createA.code === 201, `create with random_unowned (${createA.code} ${createA.body.message ?? ''})`);
  const charA = createA.body.data;
  console.log('   unowned spawn ->', charA?.currentChunkId, 'pos', charA?.position?.x, charA?.position?.y, 'method', charA?.spawnMethod);
  assert(charA?.spawnMethod === 'random_unowned', 'spawnMethod stored as random_unowned');
  const [cx, cy] = charA.currentChunkId.split('_').map(Number);
  assert(cx !== 10 || cy !== 10, 'spawn chunk is NOT the legacy 10_10');
  assert(charA.position.x === cx * 32 + 5 && charA.position.y === cy * 32 + 5, 'world coords = chunk origin + (5,5)');

  // 3. second user picks a different chunk (recently-selected exclusion)
  const tokenB = await register(`sp_pub_${stamp}`);
  const createB = await post('/character/create', {
    nickname: `邻居${stamp}`,
    appearance: { gender: 'female', hair: 'long', skin: 'tan', outfit: 'traveler' },
    startContinent: 'west',
    spawnMethod: 'random_unowned',
  }, tokenB);
  assert(createB.code === 201, `second create with random_unowned (${createB.code})`);
  const charB = createB.body.data;
  console.log('   unowned spawn 2 ->', charB?.currentChunkId);
  assert(charB?.currentChunkId !== charA?.currentChunkId, 'two consecutive unowned spawns pick different chunks');

  // 4. character/me reflects spawnMethod
  const me = await get('/character/me', tokenA);
  assert(me.code === 200, 'GET /character/me returns 200');
  assert(me.body.data?.spawnMethod === 'random_unowned', 'GET /character/me exposes spawnMethod');

  // 5. invalid spawn method rejected
  const tokenC = await register(`sp_bad_${stamp}`);
  const bad = await post('/character/create', {
    nickname: `坏法${stamp}`,
    appearance: { gender: 'male', hair: 'short', skin: 'fair', outfit: 'villager' },
    startContinent: 'east',
    spawnMethod: 'not_a_method',
  }, tokenC);
  assert(bad.code === 400, `invalid spawnMethod rejected with 400 (${bad.code})`);

  // 6. legacy create without spawnMethod still works (backward compat)
  const tokenD = await register(`sp_legacy_${stamp}`);
  const legacy = await post('/character/create', {
    nickname: `旧客${stamp}`,
    appearance: { gender: 'female', hair: 'ponytail', skin: 'dark', outfit: 'noble' },
    startContinent: 'south',
  }, tokenD);
  assert(legacy.code === 201, `legacy create without spawnMethod (${legacy.code} ${legacy.body.message ?? ''})`);
  assert(legacy.body.data?.currentChunkId === '10_10', 'legacy spawn still 10_10');
  assert(legacy.body.data?.spawnMethod === 'default', 'legacy spawnMethod recorded as default');

  // 7. random_public fallback message when pool empty (should be 404)
  const tokenE = await register(`sp_pubonly_${stamp}`);
  const pub = await post('/character/create', {
    nickname: `访客${stamp}`,
    appearance: { gender: 'male', hair: 'short', skin: 'fair', outfit: 'traveler' },
    startContinent: 'east',
    spawnMethod: 'random_public',
  }, tokenE);
  // Public pool may be empty in this test env (no public chunks) -> expect 404 with friendly message
  if (pub.code === 404) {
    assert(/公开地块/.test(pub.body.message ?? ''), 'random_public with empty pool returns friendly 404');
  } else {
    assert(pub.code === 201, `random_public create (${pub.code})`);
    console.log('   public spawn ->', pub.body.data?.currentChunkId);
    assert(pub.body.data?.spawnMethod === 'random_public', 'random_public recorded');
  }

  console.log('E2E DONE');
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error('E2E crashed:', err);
  process.exit(1);
});