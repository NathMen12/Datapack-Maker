#!/usr/bin/env node
/* ============================================================
   Datapack Maker — lanceur racine (client + serveur).
   Usage :
     node index.js            -> dev    : API (3000) + client Vite (5173)
     node index.js --build    -> build production du client
     node index.js --start    -> prod   : l'API sert le client sur le port 3000
   ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || '--dev';
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const children = [];

function run(name, cmd, args, color) {
  const child = spawn(cmd, args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], shell: isWin });
  const paint = (buf) =>
    String(buf)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((l) => process.stdout.write(color + '[' + name + ']\u001b[0m ' + l + '\n'));
  child.stdout.on('data', paint);
  child.stderr.on('data', paint);
  child.on('exit', (code) => {
    process.stdout.write(color + '[' + name + ']\u001b[0m exited (' + code + ')\n');
    if (code !== 0) shutdown(code);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const c of children) {
    try {
      if (isWin) spawn('taskkill', ['/pid', c.pid, '/T', '/F']);
      else c.kill('SIGTERM');
    } catch { /* deja mort */ }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const distIndex = path.join(__dirname, 'client', 'dist', 'index.html');

if (mode === '--build') {
  console.log('\u001b[36m[datapack-maker]\u001b[0m Build production du client...\n');
  run('client-build', npmCmd, ['run', 'build', '-w', 'client'], '\u001b[32m');
} else if (mode === '--start') {
  if (!fs.existsSync(distIndex)) {
    console.error('\u001b[31m[datapack-maker]\u001b[0m client/dist introuvable. Lancez d\'abord : node index.js --build');
    process.exit(1);
  }
  console.log('\u001b[36m[datapack-maker]\u001b[0m Mode production : http://localhost:3000\n');
  run('server', npmCmd, ['run', 'start', '-w', 'server'], '\u001b[36m');
} else {
  console.log('\u001b[36m[datapack-maker]\u001b[0m Mode dev : API http://localhost:3000 | Client http://localhost:5173\n');
  run('server', npmCmd, ['run', 'dev', '-w', 'server'], '\u001b[36m');
  run('client', npmCmd, ['run', 'dev', '-w', 'client'], '\u001b[32m');
}
