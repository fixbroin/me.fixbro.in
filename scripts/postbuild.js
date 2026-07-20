const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  try {
    if (fs.existsSync(src)) {
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      console.log(`[Postbuild] Successfully copied ${src} -> ${dest}`);
    } else {
      console.log(`[Postbuild] Warning: Source path ${src} does not exist.`);
    }
  } catch (err) {
    console.error(`[Postbuild] Error copying ${src} -> ${dest}:`, err);
  }
}

const root = path.join(__dirname, '..');
const standalonePath = path.join(root, '.next', 'standalone');

if (fs.existsSync(standalonePath)) {
  console.log('[Postbuild] Standalone folder found. Copying assets...');
  copyDir(path.join(root, 'public'), path.join(standalonePath, 'public'));
  copyDir(path.join(root, '.next', 'static'), path.join(standalonePath, '.next', 'static'));
} else {
  console.log('[Postbuild] Standalone folder not found. Skipping static files copy.');
}
