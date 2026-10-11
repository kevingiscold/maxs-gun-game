// Ghost visibility against a real server: a dead player's position must reach
// other dead players and never the living.
process.env.GUN_TEST_ROLLS = '1'; // every pull loaded
process.env.GUN_TEST_BOT = 'shoot';
process.env.GUN_TEST_FIRST = 'last'; // the bot (last seat) shoots first, at seat 0
const { io } = await import('socket.io-client');
const { startServer } = await import('../server/index.js');

const srv = await startServer({ port: 0 });
const url = `http://127.0.0.1:${srv.port}`;
const connect = async (name) => {
  const s = io(url, { transports: ['websocket'] });
  await new Promise((r) => s.once('connect', r));
  s.state = null;
  s.ghostMsgs = [];
  s.on('room:state', (st) => (s.state = st));
  s.on('ghost:pose', (m) => s.ghostMsgs.push(m));
  s.call = (ev, d) => new Promise((r) => s.emit(ev, d, r));
  s.name = name;
  return s;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(100);
  }
};

const A = await connect('A');
const B = await connect('B');
const { code } = await A.call('room:create', { name: 'A' });
await B.call('room:join', { code, name: 'B' });
B.emit('player:update', { ready: true });
await A.call('room:addBot', {});
await wait(200);
await A.call('room:start', {});
const alive = (s, id) => s.state.game.players.find((p) => p.id === id).alive;
const aId = A.state.you;
const bId = B.state.you;

// bot shoots A (loaded): A is dead, B alive
await until(() => A.state.game && !alive(A, aId));
A.emit('ghost:pose', { p: [0, 1.6, 0], yaw: 0 });
await wait(400);
const bWhileAlive = B.ghostMsgs.length;

// bot keeps the gun, shoots B: now both are dead
await until(() => !alive(B, bId));
A.emit('ghost:pose', { p: [1, 1.7, 0], yaw: 1 });
B.emit('ghost:pose', { p: [-1, 1.5, 0], yaw: 2 });
await wait(400);
console.log(
  JSON.stringify({
    livingPlayerReceivedGhost: bWhileAlive,
    deadBReceivedFromA: B.ghostMsgs.map((m) => m.p),
    deadAReceivedFromB: A.ghostMsgs.map((m) => m.p),
    winner: A.state.game.players.find((p) => p.id === A.state.game.winnerId)?.name ?? null,
  }),
);
A.close();
B.close();
srv.close();
process.exit(bWhileAlive === 0 && B.ghostMsgs.length === 1 && A.ghostMsgs.length === 1 ? 0 : 1);
