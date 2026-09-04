#!/usr/bin/env node
// Global `dashboard` command. Resolves paths from its own location (not the
// shell's cwd) so it works from any directory. If the dashboard hasn't been
// built yet it builds it first, then hands off to dashboard-server.mjs.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const binDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(binDir, '..');
const serverFile = path.join(repoRoot, 'dashboard-server.mjs');
const distIndex = path.join(repoRoot, 'dashboard', 'dist', 'index.html');

// --help shouldn't trigger a build.
const wantsHelp = process.argv.slice(2).some((a) => a === '--help' || a === '-h');

if (!wantsHelp && !fs.existsSync(distIndex)) {
  console.log('Dashboard not built yet — running `npm run build -w dashboard`…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build', '-w', 'dashboard'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('Build failed — fix the errors above and try again.');
    process.exit(build.status ?? 1);
  }
}

const child = spawn(process.execPath, [serverFile, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));