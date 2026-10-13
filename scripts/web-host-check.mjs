// Stand-in for a desktop host while testing the browser version: serves the
// built site on PORT, opens a room with a scripted host plus bots, and starts
// the match once a browser player has joined and readied up.
// node scripts/web-host-check.mjs [port] [classic|murder]
const port = Number(process.argv[2]) || 3055;
const mode = process.argv[3] || 'classic';
const { io } = await import('socket.io-client');
const { startServer } = await import('../server/index.js');

await startServer({ port, fallback: false });
const host = io(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
await new Promise((r) => host.once('connect', r));
const call = (ev, d) => new Promise((r) => host.emit(ev, d, r));
const { code } = await call('room:create', { name: 'Host' });
host.emit('room:settings', { mode });
for (let i = 0; i < (mode === 'murder' ? 3 : 1); i++) await call('room:addBot', {});
console.log(`ROOM ${code} -> http://localhost:${port}/${code}`);

let started = false;
host.on('room:state', async (room) => {
  const web = room.members.find((m) => !m.isBot && m.id !== room.you);
  if (!started && web?.ready) {
    started = true;
    const res = await call('room:start', {});
    console.log('START', JSON.stringify(res));
  }
});
