// electron-builder afterPack hook. There's no Apple developer certificate, so on
// macOS the app is ad-hoc signed: without any signature Apple Silicon Macs call
// the app "damaged" and refuse to open it. (Our Info.plist edits invalidate
// Electron's own signature, so this has to run after packing.)
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
