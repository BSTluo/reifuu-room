import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';

async function login(username: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: username, password: 'test123456' }),
  });
  const json: any = await res.json();
  return json.data.accessToken;
}

async function getCharacter(token: string) {
  const res = await fetch(`${BASE}/character/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json: any = await res.json();
  return json.data;
}

function connect(token: string) {
  return io(BASE, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const tokenA = await login('player_a');
  const tokenB = await login('player_b');
  const charA = await getCharacter(tokenA);
  const charB = await getCharacter(tokenB);
  console.log(`A=${charA.nickname}(${charA.id}) B=${charB.nickname}(${charB.id})`);

  const sockA = connect(tokenA);
  const sockB = connect(tokenB);

  await new Promise<void>((resolve, reject) => {
    let done = 0;
    sockA.on('connect', () => { done++; if (done === 2) resolve(); });
    sockB.on('connect', () => { done++; if (done === 2) resolve(); });
    sockA.on('connect_error', reject);
    sockB.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
  console.log('Both sockets connected');

  // B requests state
  const statePromise = new Promise<any>((resolve) => {
    sockB.once('pigeon:state', (data) => resolve(data));
  });
  sockB.emit('pigeon:request-state');
  const state = await statePromise;
  console.log(`B pigeon:state -> messages=${state.messages.length} unread=${state.unreadCount}`);

  // A sends to B (instant, same chunk)
  const sentPromise = new Promise<any>((resolve) => {
    sockA.once('pigeon:sent', (data) => resolve(data));
  });
  const deliveredPromise = new Promise<any>((resolve) => {
    sockB.once('pigeon:delivered', (data) => resolve(data));
  });
  sockA.emit('pigeon:send', { toCharacterId: String(charB.id), content: 'socket instant test' });
  const sent = await sentPromise;
  console.log(`A pigeon:sent -> messageId=${sent.messageId} to=${sent.toNickname} delayMs=${sent.delayMs} delivered=${sent.delivered}`);
  const delivered = await deliveredPromise;
  console.log(`B pigeon:delivered -> from=${delivered.fromNickname} content='${delivered.content}'`);

  // B marks read
  const readPromise = new Promise<any>((resolve) => {
    sockB.once('pigeon:read-confirmed', (data) => resolve(data));
  });
  sockB.emit('pigeon:mark-read', { messageId: delivered.messageId });
  const read = await readPromise;
  console.log(`B pigeon:read-confirmed -> messageId=${read.messageId} unread=${read.unreadCount}`);

  // Error case: self-send
  const errPromise = new Promise<any>((resolve) => {
    sockA.once('error', (data) => resolve(data));
  });
  sockA.emit('pigeon:send', { toCharacterId: String(charA.id), content: 'self' });
  const err = await errPromise;
  console.log(`A error (self-send) -> ${err.message}`);

  sockA.disconnect();
  sockB.disconnect();
  console.log('ALL SOCKET TESTS PASSED');
}

main().catch((err) => {
  console.error('SOCKET TEST FAILED:', err);
  process.exit(1);
});