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

const isProd = (env.NODE_ENV || 'development') === 'production';

/* Origines autorisees en cross-origin (separees par des virgules si plusieurs).
   NB : le same-origin (client servi par cette API) est toujours autorise,
   independamment de cette liste.
   Ports de test : API 40007, client Vite 40071. */
const clientOrigins = (env.CLIENT_ORIGIN || 'http://localhost:40071,http://127.0.0.1:40071')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/* Quota IA : doit etre un nombre fini positif, sinon le blocage de quota
   ne fonctionne plus (division par NaN jamais >= 100). */
const rawQuota = Number(env.AI_QUOTA_TOKENS || 5000);
const aiQuotaTokens = Number.isFinite(rawQuota) && rawQuota > 0 ? Math.floor(rawQuota) : 5000;

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port: Number(env.PORT || 40007),
  clientOrigins,
  jwtSecret: env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  jwtSecretProvided: Boolean(env.JWT_SECRET),
  dbPath: path.isAbsolute(env.DB_PATH || '') ? env.DB_PATH : path.join(SERVER_ROOT, env.DB_PATH || 'data/app.db'),
  logsDir: path.join(SERVER_ROOT, 'logs'),
  groqApiKey: env.GROQ_API_KEY || '',
  aiModel: env.AI_MODEL || 'openai/gpt-oss-120b',
  aiQuotaTokens,
  /* API Modrinth (surchargeable pour les tests : serveur factice local). */
  modrinthApiBase: (env.MODRINTH_API_BASE || 'https://api.modrinth.com/v2').replace(/\/+$/, ''),
  appVersion: env.APP_VERSION || '1.1.0',
  /* Cle de chiffrement des secrets tiers (jetons Modrinth) au repos.
     Dediee si TOKEN_SECRET est fourni, sinon derivee du secret JWT. */
  tokenSecret: env.TOKEN_SECRET || env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
};

export { SERVER_ROOT };
