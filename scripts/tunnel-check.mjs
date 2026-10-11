// End-to-end check of the internet path: open a Cloudflare quick tunnel to a
// running game server, then connect two players *through the tunnel*.
// usage: node scripts/tunnel-check.mjs [port=3001]
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { parseInvite, formatInvite } from '../src/net/invite.js';

const port = Number(process.argv[2]) || 3001;
const extra = process.argv.slice(3); // e.g. --protocol http2
const proc = spawn('vendor/cloudflared.exe', ['tunnel', '--no-autoupdate', ...extra, '--url', `http://127.0.0.1:${port}`], { windowsHide: true });
proc.stderr.on('data', (b) => {
  for (const line of String(b).split('\n')) if (/ERR|WRN|Registered|protocol/i.test(line)) console.log('[cf]', line.trim().slice(0, 160));
});
const done = (code) => {
  proc.kill();
  process.exit(code);
};
setTimeout(() => {
  console.log('TIMEOUT');
  done(1);
}, 90000);

// Same rule as the app: only use the address once Cloudflare has registered it,
// otherwise the first DNS lookup caches "does not exist".
const url = await new Promise((resolve) => {
  let found = null;
  let registered = false;
  const scan = (b) => {
    const s = String(b);
    const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) found = m[0];
    if (/Registered tunnel connection/.test(s)) registered = true;
    if (found && registered) setTimeout(() => resolve(found), 12000);
  };
  proc.stdout.on('data', scan);
  proc.stderr.on('data', scan);
});
console.log('tunnel', url);

const connect = async () => {
  // DNS for a fresh quick tunnel can take a few seconds to propagate
  for (let i = 0; i < 20; i++) {
    const s = io(url, { transports: ['websocket'], reconnection: false, timeout: 8000 });
    const ok = await new Promise((r) => {
      s.once('connect', () => r(true));
      s.once('connect_error', (e) => {
        console.log('connect_error:', e.message, e.description?.message || '');
        r(false);
      });
    });
    if (ok) return s;
    s.close();
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('could not connect through tunnel');
};

const host = await connect();
const created = await new Promise((r) => host.emit('room:create', { name: 'Host', avatar: {} }, r));
const invite = formatInvite(url, created.code);
console.log('invite', invite);

const friend = await connect();
const parsed = parseInvite(invite);
const joined = await new Promise((r) => friend.emit('room:join', { code: parsed.code, name: 'Friend', avatar: {} }, r));
console.log('friend joined', joined);
friend.emit('player:update', { ready: true });
await new Promise((r) => setTimeout(r, 500));
const started = await new Promise((r) => host.emit('room:start', {}, r));
const state = await new Promise((r) => friend.once('room:state', r));
console.log('match started', started, 'phase', state.game?.phase, 'players', state.members.length, 'transport', friend.io.engine.transport.name);
host.close();
friend.close();
done(started.ok && state.game ? 0 : 1);
