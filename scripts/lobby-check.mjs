// Lobby rules against a real server: Start needs 2+ filled slots (bots count),
// bots fill slots up to 6, the leader can remove them, and a bot match starts.
import { io } from 'socket.io-client';
import { startServer } from '../server/index.js';

const srv = await startServer({ port: 0 });
const url = `http://127.0.0.1:${srv.port}`;
const s = io(url, { transports: ['websocket'] });
await new Promise((r) => s.once('connect', r));
let last = null;
s.on('room:state', (st) => (last = st));
const call = (ev, data) => new Promise((r) => s.emit(ev, data, r));
const settle = () => new Promise((r) => setTimeout(r, 150));
const out = {};

await call('room:create', { name: 'Max' });
out.startAlone = (await call('room:start', {})).error;
for (let i = 0; i < 6; i++) await call('room:addBot', {});
await settle();
out.seatsAfterSixAdds = last.members.length;
out.botNames = last.members.filter((m) => m.isBot).map((m) => m.name);
s.emit('room:removeBot', { id: last.members.find((m) => m.isBot).id });
await settle();
out.afterRemove = last.members.length;
out.start = await call('room:start', {});
await settle();
out.game = { phase: last.game?.phase, players: last.game?.players.length, bots: last.game?.players.filter((p) => p.isBot).length };
console.log(JSON.stringify(out, null, 1));
s.close();
srv.close();
process.exit(0);
