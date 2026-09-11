import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bgRed: '\x1b[41m',
  white: '\x1b[97m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const LEVELS = {
  INFO: { color: COLORS.cyan, label: 'INFO' },
  ALERT: { color: COLORS.yellow, label: 'ALERT' },
  ERROR: { color: COLORS.red, label: 'ERROR' },
  FATAL: { color: `${COLORS.bgRed}${COLORS.white}${COLORS.bold}`, label: 'FATAL ERROR' },
};

function timestamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function logFileLine(line) {
  try {
    fs.mkdirSync(config.logsDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(path.join(config.logsDir, `server-${day}.log`), line + '\n');
  } catch {
    /* la journalisation fichier ne doit jamais faire planter le serveur */
  }
}

function emit(level, args) {
  const conf = LEVELS[level];
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const prefix = `${COLORS.dim}[${timestamp()}]${COLORS.reset} ${conf.color}${COLORS.bold}[${conf.label}]${COLORS.reset} `;
  const plain = `[${timestamp()}] [${conf.label}] ${msg}`;
  process.stdout.write(prefix + conf.color + msg + COLORS.reset + '\n');
  logFileLine(plain);
  return plain;
}

export const logger = {
  info: (...a) => emit('INFO', a),
  alert: (...a) => emit('ALERT', a),
  error: (...a) => emit('ERROR', a),
  fatal: (...a) => {
    emit('FATAL', a);
    process.exit(1);
  },
};

export function httpColor(status) {
  if (status >= 500) return COLORS.red;
  if (status >= 400) return COLORS.yellow;
  if (status >= 300) return COLORS.cyan;
  return COLORS.green ?? '\x1b[32m';
}

export default logger;
