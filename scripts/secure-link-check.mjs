// Browsers only allow cameras on https pages. Checks that a browser opening
// the host's plain-http same-Wi-Fi address is sent to the https tunnel
// address once the host is "open to the internet" (and not before, and that
// the app's own localhost page and the game's assets are never redirected).
// Opens a real Cloudflare quick tunnel: node scripts/secure-link-check.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { startServer, setPublicUrl } = await import('../server/index.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const srv = await startServer({ port: 0 });
const lanBase = `http://${srv.lan[0]}:${srv.port}`;
const get = (url, opts = {}) => fetch(url, { redirect: 'manual', headers: { accept: 'text/html' }, ...opts });
const checks = {};

checks.beforeTunnel_lanPageServed = (await get(`${lanBase}/ABCDE`)).status === 200;
checks.beforeTunnel_noPublicUrl = (await (await get(`${lanBase}/api/info`)).json()).publicUrl === null;

const exe = path.join(here, '..', 'vendor', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${srv.port}`], { windowsHide: true });
const url = await new Promise((resolve, reject) => {
  let found = null;
  const t = setTimeout(() => reject(new Error('no tunnel')), 45000);
  const scan = (b) => {
    const s = String(b);
    found = found || s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (found && /Registered tunnel connection/.test(s)) {
      clearTimeout(t);
      setTimeout(() => resolve(found), 10000); // same settle delay as the app
    }
  };
  proc.stdout.on('data', scan);
  proc.stderr.on('data', scan);
});
setPublicUrl(url);

const lan = await get(`${lanBase}/ABCDE?x=1`);
checks.lanPage_redirectsToHttps = lan.status === 302 && lan.headers.get('location') === `${url}/ABCDE?x=1`;
checks.lanAssets_notRedirected = (await get(`${lanBase}/textures/lite/dark_wood_diff.jpg`)).status === 200;
checks.localhost_notRedirected = (await get(`http://127.0.0.1:${srv.port}/ABCDE`)).status === 200;
checks.apiInfo_hasPublicUrl = (await (await get(`${lanBase}/api/info`)).json()).publicUrl === url;
let page = null;
for (let i = 0; i < 6 && !page; i++) {
  try {
    const r = await fetch(`${url}/ABCDE`);
    if (r.ok) page = await r.text();
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
  }
}
checks.httpsTunnelServesGame = !!page && page.includes('<div id="root">');

console.log(JSON.stringify({ url, lanBase, ...checks }, null, 1));
proc.kill();
srv.close();
process.exit(Object.values(checks).every((v) => v === true) ? 0 : 1);
