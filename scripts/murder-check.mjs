// Murder! against a real server: player limits, and what the living may learn
// in the dark (nothing about who) versus what the dead learn (everything).
process.env.GUN_TEST_MURDERER = 'leader'; // A is the murderer
process.env.GUN_TEST_DARK = '2500,3000,1500'; // lights out 2.5 s in, for 1.5 s
process.env.GUN_TEST_BOT = 'idle'; // bots never shoot, so the script decides who dies
const { io } = await import('socket.io-client');
const { startServer } = await import('../server/index.js');

const srv = await startServer({ port: 0 });
const url = `http://127.0.0.1:${srv.port}`;
const connect = async (name) => {
  const s = io(url, { transports: ['websocket'] });
  await new Promise((r) => s.once('connect', r));
  s.state = null;
  s.aims = [];
  s.fx = [];
  s.on('room:state', (st) => (s.state = st));
  s.on('aim:pose', (m) => s.aims.push(m));
  s.on('murder:fx', (m) => s.fx.push(m));
  s.call = (ev, d) => new Promise((r) => s.emit(ev, d, r));
  return s;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await wait(50);
  }
};
const checks = {};
const check = (name, ok) => (checks[name] = !!ok);

const A = await connect('A');
const B = await connect('B');
const C = await connect('C');
const { code } = await A.call('room:create', { name: 'A' });
for (const [s, n] of [[B, 'B'], [C, 'C']]) {
  await s.call('room:join', { code, name: n });
  s.emit('player:update', { ready: true });
}
A.emit('room:settings', { mode: 'murder', killGoal: 3 });
await A.call('room:addBot', {});
await wait(200);
check('needs 5 to start', /at least 5/.test((await A.call('room:start', {})).error));
await A.call('room:addBot', {});
await wait(200);
for (let i = 0; i < 8; i++) await A.call('room:addBot', {});
await wait(200);
check('seats up to 12', A.state.members.length === 12);
check('start ok', (await A.call('room:start', {})).ok);
await until(() => A.state.game && B.state.game && C.state.game);
const [a, b, c] = [A, B, C].map((s) => s.state.you);
const g = (s) => s.state.game;
const alive = (s, id) => g(s).players.find((p) => p.id === id).alive;

check('murderer knows', g(A).murdererId === a);
check('innocents do not', g(B).murdererId === null && g(C).murdererId === null);
check('goal set', g(B).killGoal === 3);

// light: aims reach everyone
B.emit('aim:pose', { yaw: 0.5, pitch: 0 });
await wait(300);
check('light: aim relayed', A.aims.some((m) => m.id === b) && C.aims.some((m) => m.id === b));

// dark: A cocks, looks at C, shoots C
await until(() => g(B).dark);
const before = { B: B.aims.length, C: C.aims.length };
A.emit('aim:pose', { yaw: 1, pitch: 0 });
check('dark: cock ok', (await A.call('game:cock', {})).ok);
await wait(150);
check('dark: cock heard but anonymous', B.fx.some((e) => e.type === 'cock' && !e.id));
check('dark: shot ok', (await A.call('game:shoot', { targetId: c })).ok);
check('dark: one shot per blackout', (await A.call('game:cock', {})).error === 'spent' && g(A).spent === true);
B.emit('aim:pose', { yaw: -1, pitch: 0 });
await wait(300);
check('dark: the murderer still sees where people look', A.aims.some((m) => m.id === b && m.yaw === -1));
check('dark: the murderer sees the body', !alive(A, c));
check('dark: living get no aims', B.aims.filter((m) => m.id === a).length === 0 && B.aims.length === before.B);
const bShot = B.fx.find((e) => e.type === 'shot');
check('dark: shot heard but anonymous', bShot && !bShot.shooterId && !bShot.targetId);
check('dark: body not visible to the living', alive(B, c));
check('dark: victim is dead and knows the murderer', !alive(C, c) && g(C).murdererId === a && g(C).deaths[0].by === a);

// lights back on
await until(() => !g(B).dark);
check('lights on: body found', !alive(B, c) && g(B).bodies === 1);
check('lights on: shooter still unknown', g(B).deaths[0].by === null);

// light: B shoots A — the table wins
await B.call('game:cock', {});
await wait(100);
check('light: cock names the cocker', A.fx.some((e) => e.type === 'cock' && e.id === b));
await B.call('game:shoot', { targetId: a });
await until(() => g(B).phase === 'gameover');
check('town wins', g(B).winner === 'town' && g(B).endedBy === b && g(B).murdererId === a);
check('game over reveals the dark shooter', g(B).deaths[0].by === a);

console.log(JSON.stringify(checks, null, 1));
for (const s of [A, B, C]) s.close();
srv.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
