#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const extraArgs = process.argv.slice(2);

const server = spawn('npx', ['tsx', 'server/index.ts'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

const vite = spawn('npx', ['vite', '--open', ...extraArgs], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

for (const child of [server, vite]) {
  child.on('error', (err) => {
    console.error('Failed to start flashmind:', err.message);
    process.exit(1);
  });
}

process.on('SIGINT', () => {
  server.kill('SIGINT');
  vite.kill('SIGINT');
});
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  vite.kill('SIGTERM');
});