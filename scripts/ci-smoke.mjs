// CI smoke test for a packaged build: launch it in self-test mode (own profile
// folder, cameras denied), let it start a match against a bot, and require the
// JSON report it prints. Usage: node scripts/ci-smoke.mjs <path to app binary>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) {
  console.error('app binary not found:', exe);
  process.exit(1);
}
const out = path.resolve(process.env.SMOKE_OUT || 'smoke');
fs.mkdirSync(out, { recursive: true });
const child = spawn(exe, [], {
  env: { ...process.env, GUN_SELFTEST: out, GUN_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'mgg-')) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
const done = (code, msg) => {
  console.log(msg);
  clearTimeout(timer);
  child.kill();
  process.exit(code);
};
const onData = (d) => {
  log += d;
  const ok = log.match(/SELFTEST (\{.*\})/);
  if (ok) {
    const r = JSON.parse(ok[1]);
    done(r.hud?.includes('Round') ? 0 : 1, 'report: ' + JSON.stringify(r, null, 2));
  }
  if (log.includes('SELFTEST-ERROR')) done(1, log);
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);
child.on('exit', (c) => done(1, `app exited (${c}) before reporting:\n` + log));
const timer = setTimeout(() => done(1, 'timed out:\n' + log), 180000);
