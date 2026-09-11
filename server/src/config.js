import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(SERVER_ROOT, '.env');
  const vars = {};
  if (!fs.existsSync(envPath)) return vars;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[m[1]] = value;
  }
  return vars;
}

const env = { ...loadEnvFile(), ...process.env };

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  jwtSecret: env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  dbPath: path.join(SERVER_ROOT, env.DB_PATH || 'data/app.db'),
  logsDir: path.join(SERVER_ROOT, 'logs'),
  groqApiKey: env.GROQ_API_KEY || '',
  aiModel: env.AI_MODEL || 'openai/gpt-oss-120b',
  aiQuotaTokens: Number(env.AI_QUOTA_TOKENS || 5000),
};

export { SERVER_ROOT };
