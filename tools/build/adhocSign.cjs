// electron-builder afterPack hook (macOS): ad-hoc signature of the .app (docs/tasks/T4.5 step 3).
// We have no Apple Developer ID (mac.identity: null), but Apple Silicon refuses to start a bundle whose
// signature was invalidated by our edits (Info.plist, resources), and Gatekeeper then says "app is damaged".
// An ad-hoc signature (`codesign -s -`) seals the bundle again. `afterPack` runs before the dmg is made.
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/** @param {{ electronPlatformName: string, appOutDir: string, packager: { appInfo: { productFilename: string } } }} context */
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  - ad-hoc signing ${app}`);
  const r = spawnSync('codesign', ['--force', '--deep', '-s', '-', app], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`codesign (ad-hoc) failed with status ${r.status}`);
};
