/**
 * electron-builder afterPack hook
 *
 * Keeps the packaged macOS app on the classic icon.icns path.
 * The committed macOS 26 Assets.car currently renders differently from
 * icon.icns once the app launches, so packaged builds must not point the
 * Dock at the asset catalog.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

function removePlistKey(plistPath, key) {
  if (!fs.existsSync(plistPath)) return;

  try {
    execFileSync('/usr/bin/plutil', ['-remove', key, plistPath], { stdio: 'ignore' });
    console.log(`Removed ${key} from ${plistPath}`);
  } catch (err) {
    // plutil exits non-zero when the key is already absent. That is the desired state.
    console.log(`${key} already absent from ${plistPath}`);
  }
}

module.exports = async function afterPack(context) {
  // Only process macOS builds
  if (context.electronPlatformName !== 'darwin') {
    console.log('Skipping macOS icon normalization (not macOS)');
    return;
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appBundlePath = path.join(context.appOutDir, `${productFilename}.app`);
  const resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');
  const destAssetsCar = path.join(resourcesDir, 'Assets.car');
  const infoPlist = path.join(appBundlePath, 'Contents', 'Info.plist');

  if (fs.existsSync(destAssetsCar)) {
    fs.unlinkSync(destAssetsCar);
    console.log(`Removed Assets.car so macOS uses icon.icns: ${destAssetsCar}`);
  } else {
    console.log('Assets.car absent; macOS will use icon.icns');
  }

  removePlistKey(infoPlist, 'CFBundleIconName');
};
