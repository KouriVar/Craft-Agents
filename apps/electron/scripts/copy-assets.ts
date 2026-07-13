/**
 * Cross-platform asset copy script.
 *
 * Copies the resources/ directory to dist/resources/.
 * All bundled assets (docs, themes, permissions, tool-icons) now live in resources/
 * which electron-builder handles natively via directories.buildResources.
 *
 * At Electron startup, setBundledAssetsRoot(__dirname) is called, and then
 * getBundledAssetsDir('docs') resolves to <__dirname>/resources/docs/, etc.
 *
 * Run: bun scripts/copy-assets.ts
 */

import { cpSync, copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Copy all resources (icons, themes, docs, permissions, tool-icons, etc.)
cpSync('resources', 'dist/resources', { recursive: true });

console.log('✓ Copied resources/ → dist/resources/');

mkdirSync(join('dist', 'resources', 'vendor', 'xterm'), { recursive: true });
copyFileSync(
  join('..', '..', 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css'),
  join('dist', 'resources', 'vendor', 'xterm', 'xterm.css'),
);
copyFileSync(
  join('..', '..', 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js'),
  join('dist', 'resources', 'vendor', 'xterm', 'xterm.js'),
);
copyFileSync(
  join('..', '..', 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.js'),
  join('dist', 'resources', 'vendor', 'xterm', 'addon-fit.js'),
);
copyFileSync(
  join('src', 'preload', 'terminal-preload.cjs'),
  join('dist', 'terminal-preload.cjs'),
);
console.log('✓ Copied terminal pane assets');

// Copy PowerShell parser script (for Windows command validation in Explore mode)
// Source: packages/shared/src/agent/powershell-parser.ps1
// Destination: dist/resources/powershell-parser.ps1
const psParserSrc = join('..', '..', 'packages', 'shared', 'src', 'agent', 'powershell-parser.ps1');
const psParserDest = join('dist', 'resources', 'powershell-parser.ps1');
try {
  copyFileSync(psParserSrc, psParserDest);
  console.log('✓ Copied powershell-parser.ps1 → dist/resources/');
} catch (err) {
  // Only warn - PowerShell validation is optional on non-Windows platforms
  console.log('⚠ powershell-parser.ps1 copy skipped (not critical on non-Windows)');
}
