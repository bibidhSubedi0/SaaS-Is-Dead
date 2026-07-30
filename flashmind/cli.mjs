#!/usr/bin/env node

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const server = spawn('npx', ['vite', '--open'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

server.on('error', (err) => {
  console.error('Failed to start flashmind:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
