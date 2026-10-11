// Desktop app: runs the game server in-process, opens the game from it on
// localhost (so cameras work even when the match server is elsewhere), and can
// expose this PC to the internet with a Cloudflare quick tunnel.
import { app, BrowserWindow, Menu, ipcMain, session, shell, systemPreferences } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Use the real GPU (laptops otherwise often pick the integrated one, and
// Chromium blocklists some drivers), and keep rendering when the window loses focus.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Tests run in their own profile folder so they never touch the player's saved
// character or settings (Electron ignores APPDATA on Windows).
if (process.env.GUN_USER_DATA) app.setPath('userData', path.resolve(process.env.GUN_USER_DATA));

let server = null;
let tunnel = null; // { proc, url }
let win = null;

function cloudflaredPath() {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const packaged = path.join(process.resourcesPath || '', name);
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(here, '..', 'vendor', name);
}

function startTunnel() {
  if (tunnel?.url) return Promise.resolve(tunnel.url);
  const exe = cloudflaredPath();
  if (!fs.existsSync(exe)) return Promise.reject(new Error('Tunnel helper (cloudflared) is missing from this build.'));
  return new Promise((resolve, reject) => {
    // http2 (TCP 443) rather than the QUIC default: QUIC/UDP is blocked on many
    // school and work networks, and its fallback takes ~20 s.
    const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${server.port}`], {
      windowsHide: true,
    });
    tunnel = { proc, url: null };
    const timer = setTimeout(() => {
      stopTunnel();
      reject(new Error('Cloudflare did not hand out an address in time. Check your internet connection.'));
    }, 40000);
    let found = null;
    let registered = false;
    const scan = (buf) => {
      const s = String(buf);
      const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) found = m[0];
      if (/Registered tunnel connection/.test(s)) registered = true;
      // Hand out the address only once it's live: a friend looking it up any
      // earlier gets "does not exist" cached by their DNS for minutes.
      if (found && registered && !tunnel?.url) {
        tunnel.url = found;
        clearTimeout(timer);
        setTimeout(() => resolve(found), 10000);
      }
    };
    proc.stdout.on('data', scan);
    proc.stderr.on('data', scan);
    proc.on('exit', () => {
      clearTimeout(timer);
      if (tunnel?.proc === proc) tunnel = null;
      reject(new Error('Tunnel stopped.'));
    });
  });
}

function stopTunnel() {
  tunnel?.proc.kill();
  tunnel = null;
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#070403',
    title: "Max's Gun Game",
    icon: path.join(here, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  // macOS needs an app menu for Cmd+C/V (pasting invites), Cmd+Q and fullscreen;
  // Windows has none.
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  } else win.removeMenu();
  win.once('ready-to-show', () => win.show());

  const origin = `http://127.0.0.1:${server.port}`;
  // Camera + mic only for the game's own page — and never during automated
  // self-tests, whose window captures must not contain anyone's webcam.
  const selfTesting = !!(process.env.GUN_SELFTEST || process.env.GUN_SELFTEST_PLAY || process.env.GUN_SELFTEST_SCENE || process.env.GUN_SELFTEST_CLICK || process.env.GUN_SELFTEST_CAP);
  // Electron gates pointer lock behind a permission too; without it every
  // "click to sit down" was silently refused.
  const allowed = (permission) =>
    permission === 'clipboard-sanitized-write' || permission === 'pointerLock' || (permission === 'media' && !selfTesting);
  session.defaultSession.setPermissionRequestHandler(async (wc, permission, cb, details) => {
    const fromGame = (details.requestingUrl || wc.getURL()).startsWith(origin);
    if (!fromGame || !allowed(permission)) return cb(false);
    // macOS also asks the user itself (System Settings > Privacy) the first time.
    if (permission === 'media' && process.platform === 'darwin') {
      const kinds = details.mediaTypes?.length ? details.mediaTypes : ['video', 'audio'];
      for (const k of kinds) {
        try {
          await systemPreferences.askForMediaAccess(k === 'video' ? 'camera' : 'microphone');
        } catch {
          /* denied: Chromium then reports no device, and the player joins camera-less */
        }
      }
    }
    cb(true);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return requestingOrigin === origin && allowed(permission);
  });

  // Links leave the app for the real browser; the game never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault();
  });

  // F11 fullscreen, Ctrl+Shift+I devtools.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  await win.loadURL(origin + '/');
}

ipcMain.handle('app:info', () => ({ port: server.port, lan: server.lan, version: app.getVersion() }));
ipcMain.handle('tunnel:start', async () => {
  try {
    return { ok: true, url: await startTunnel() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('tunnel:stop', () => {
  stopTunnel();
  return { ok: true };
});

/**
 * GUN_SELFTEST=<dir>: boot, start a game vs the bot, measure fps, save a capture of the
 * window to <dir>, print a JSON report and quit. Used to verify builds without
 * looking at anyone's desktop.
 */
async function selfTest(dir) {
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(js, true);
  await new Promise((r) => setTimeout(r, 2500));
  const report = await run(`(async () => {
    window.__noPointerLock = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    btn('Play').click(); await wait(300);
    await wait(1500); btn('Add bot').click(); await wait(600); btn('Start').click(); await wait(1500);
    await wait(12000); // let the adaptive resolution settle
    const fps = await new Promise((res) => { let n = 0; const t0 = performance.now(); let worst = 0, last = t0;
      const f = (t) => { worst = Math.max(worst, t - last); last = t; n++; if (t - t0 < 6000) requestAnimationFrame(f); else res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1) }); };
      requestAnimationFrame(f); });
    const c = document.querySelector('canvas').getContext('webgl2');
    const ext = c && c.getExtension('WEBGL_debug_renderer_info');
    const cv = document.querySelector('canvas');
    return { ...fps, gpu: ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?', size: [innerWidth, innerHeight, devicePixelRatio],
      renderPixels: [cv.width, cv.height],
      hasBridge: !!window.gunApp, hud: [document.querySelector('.round')?.textContent, document.querySelector('.narration')?.textContent, document.querySelector('.hud-bottom')?.textContent].join(' / ') };
  })()`);
  const img = await win.capturePage();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app-capture.png'), img.toPNG());
  if (process.env.GUN_SELFTEST_TUNNEL) {
    // Host a room and press "Open to the internet" like a player would.
    report.invite = await run(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
      btn('Leave').click(); await wait(400);
      btn('Play').click(); await wait(2500);
      btn('Open to the internet').click();
      for (let i = 0; i < 60; i++) {
        await wait(1000);
        const v = document.querySelector('.invite-value span');
        if (v && v.textContent.includes('trycloudflare')) return v.textContent;
        const e = document.querySelector('.invite .error');
        if (e) return 'ERROR: ' + e.textContent;
      }
      return 'TIMEOUT';
    })()`);
    if (report.invite.includes('trycloudflare')) {
      const host = report.invite.split('/')[0];
      try {
        const r = await fetch(`https://${host}/api/info`);
        report.inviteReachable = r.ok;
      } catch (e) {
        report.inviteReachable = 'fetch failed: ' + e.message;
      }
    }
  }
  report.port = server.port;
  console.log('SELFTEST ' + JSON.stringify(report));
  app.quit();
}

/**
 * GUN_SELFTEST_PLAY=<dir>: play one round against the bot and capture the
 * first-person stare-down and the moments after the trigger.
 */
async function selfTestPlay(dir) {
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = async (name) => fs.writeFileSync(path.join(dir, name + '.png'), (await win.capturePage()).toPNG());
  const hud = () =>
    run(`return [document.querySelector('.narration')?.textContent, document.querySelector('.hud-bottom')?.textContent].filter(Boolean).join(' | ')`);
  fs.mkdirSync(dir, { recursive: true });
  const log = [];
  await wait(2500);
  await run(`window.__noPointerLock = true;
    const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    window.dispatchEvent(new PointerEvent('pointerdown'));
    btn('Play').click(); await new Promise((r) => setTimeout(r, 2500)); btn('Add bot').click(); await new Promise((r) => setTimeout(r, 600)); btn('Start').click();`);
  await wait(2500);
  log.push(['aiming', await hud()]);
  await snap('1-aiming');
  await wait(4500);
  log.push(['decision', await hud()]);
  await snap('2-decision');
  const shooter = await run(`return !!document.querySelector('.shooter-ui')`);
  if (shooter) {
    await wait(3000); // past the minimum stare
    log.push(['shoot', await run(`const b = document.querySelector('.btn.action.shoot'); const was = b.disabled; b.click(); return 'clicked, was disabled: ' + was;`)]);
  } else {
    log.push(['waiting for bot', 'target']);
    for (let i = 0; i < 30 && !(await run(`return !!document.querySelector('.narration.big')`)); i++) await wait(500);
  }
  await wait(2000);
  log.push(['squeeze', await hud()]);
  await snap('3-squeeze');
  await wait(1600);
  log.push(['after trigger', await hud()]);
  await snap('4-after-trigger');
  await wait(4000);
  log.push(['later', await hud()]);
  await snap('5-later');
  console.log('PLAYTEST ' + JSON.stringify({ youWereShooter: shooter, log }));
  app.quit();
}

/**
 * GUN_SELFTEST_SCENE=<dir>: add GUN_SELFTEST_BOTS bots, start, and capture at
 * the times in GUN_SELFTEST_SHOTS ("name@ms,name@ms", ms after Start). Pair
 * with the server's GUN_TEST_* overrides to stage a specific moment.
 */
async function selfTestScene(dir) {
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  await wait(2500);
  const bots = Number(process.env.GUN_SELFTEST_BOTS) || 1;
  await run(`window.__noPointerLock = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    window.dispatchEvent(new PointerEvent('pointerdown'));
    btn('Play').click(); await wait(2500);
    for (let i = 0; i < ${bots}; i++) { btn('Add bot').click(); await wait(400); }
    btn('Start').click();`);
  const t0 = Date.now();
  const shots = (process.env.GUN_SELFTEST_SHOTS || 'start@3000')
    .split(',')
    .map((s) => s.split('@'))
    .map(([name, ms]) => ({ name, ms: Number(ms) }))
    .sort((a, b) => a.ms - b.ms);
  const log = [];
  for (const s of shots) {
    await wait(Math.max(0, s.ms - (Date.now() - t0)));
    fs.writeFileSync(path.join(dir, s.name + '.png'), (await win.capturePage()).toPNG());
    log.push([s.name, await run(`return [document.querySelector('.narration')?.textContent, document.querySelector('.hud-bottom')?.textContent, document.querySelector('.afterlife-title')?.textContent].filter(Boolean).join(' | ')`)]);
  }
  console.log('SCENETEST ' + JSON.stringify(log));
  app.quit();
}

/**
 * GUN_SELFTEST_CLICK=1: start a game, then send a real (synthetic, in-window)
 * click to the middle of the scene with requestPointerLock stubbed, and report
 * whether the click would have locked the mouse. Never grabs the real mouse.
 */
async function selfTestClick() {
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(2500);
  await run(`window.__lockCalls = [];
    Element.prototype.requestPointerLock = function (o) { window.__lockCalls.push(this.tagName + ' ' + JSON.stringify(o || {})); return Promise.resolve(); };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    btn('Play').click(); await wait(2500); btn('Add bot').click(); await wait(500); btn('Start').click(); await wait(3000);
    window.__lockCalls.length = 0;`);
  const [w, h] = win.getContentSize();
  const report = {};
  for (const [name, x, y] of [['centre', w / 2, h / 2], ['left', w * 0.2, h * 0.6], ['upper', w / 2, h * 0.25]]) {
    const at = await run(`const e = document.elementFromPoint(${x}, ${y}); return e ? e.tagName + '.' + e.className : null;`);
    wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    await wait(400);
    report[name] = { at, lockCalls: await run(`const c = [...window.__lockCalls]; window.__lockCalls.length = 0; return c;`) };
  }
  console.log('CLICKTEST ' + JSON.stringify(report));
  app.quit();
}

/**
 * GUN_SELFTEST_CAP=<dir> (with GUN_USER_DATA, so the real character isn't
 * changed): put a cap on every hairstyle and capture the Character preview.
 */
async function selfTestCap(dir) {
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  await wait(2500);
  await run(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Character').click();`);
  await wait(1500);
  const rect = await run(`const r = document.querySelector('.preview').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };`);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  for (let i = 0; i < 12; i++) {
    wc.sendInputEvent({ type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120, wheelTicksY: 1, canScroll: true });
    await wait(60);
  }
  const chip = (group, v) =>
    run(`const g = [...document.querySelectorAll('.opt')].find((o) => o.querySelector('.opt-label').textContent === '${group}');
      const b = [...g.querySelectorAll('button')].find((x) => x.textContent.trim() === '${v}'); b?.click(); return !!b;`);
  const out = { fedoraOffered: await chip('Accessory', 'fedora') };
  await chip('Accessory', 'cap');
  for (const hair of ['short', 'long', 'mohawk', 'afro', 'bun', 'slick', 'bald']) {
    await chip('Hair', hair);
    await wait(700);
    fs.writeFileSync(path.join(dir, `cap-${hair}.png`), (await win.capturePage(rect)).toPNG());
  }
  // a look from the side/back for the most awkward one
  await chip('Hair', 'afro');
  wc.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    wc.sendInputEvent({ type: 'mouseMove', x: cx + i * 30, y: cy, button: 'left', modifiers: ['leftButtonDown'] });
    await wait(30);
  }
  wc.sendInputEvent({ type: 'mouseUp', x: cx + 300, y: cy, button: 'left', clickCount: 1 });
  await wait(700);
  fs.writeFileSync(path.join(dir, 'cap-afro-side.png'), (await win.capturePage(rect)).toPNG());
  console.log('CAPTEST ' + JSON.stringify(out));
  app.quit();
}

app.whenReady().then(async () => {
  server = await startServer({ port: 3001 });
  await createWindow();
  if (process.env.GUN_SELFTEST_CAP) selfTestCap(process.env.GUN_SELFTEST_CAP).catch((e) => {
    console.log('CAPTEST-ERROR ' + e.stack);
    app.quit();
  });
  if (process.env.GUN_SELFTEST_CLICK) selfTestClick().catch((e) => {
    console.log('CLICKTEST-ERROR ' + e.stack);
    app.quit();
  });
  if (process.env.GUN_SELFTEST_SCENE) selfTestScene(process.env.GUN_SELFTEST_SCENE).catch((e) => {
    console.log('SCENETEST-ERROR ' + e.stack);
    app.quit();
  });
  if (process.env.GUN_SELFTEST_PLAY) selfTestPlay(process.env.GUN_SELFTEST_PLAY).catch((e) => {
    console.log('PLAYTEST-ERROR ' + e.stack);
    app.quit();
  });
  if (process.env.GUN_SELFTEST) selfTest(process.env.GUN_SELFTEST).catch((e) => {
    console.log('SELFTEST-ERROR ' + e.stack);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  stopTunnel();
  server?.close();
  app.quit();
});
app.on('before-quit', stopTunnel);
