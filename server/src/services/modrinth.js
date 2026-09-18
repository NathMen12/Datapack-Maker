import { config } from '../config.js';
import { logger } from '../lib/logger.js';

/* ============================================================
   Client de l'API Modrinth v2 (https://docs.modrinth.com/api).

   Authentification : Personal Access Token dans l'en-tete
   `Authorization` (valeur brute, sans prefixe « Bearer »), tel que
   documente par Modrinth.

   Permissions requises sur le jeton pour publier : VERSION_CREATE.
   ============================================================ */

const TIMEOUT_MS = 20_000;
const GAME_VERSIONS_TTL_MS = 60 * 60 * 1000;

export class ModrinthError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'ModrinthError';
    this.code = code;
    this.status = status;
  }
}

function baseHeaders(token) {
  const headers = {
    Accept: 'application/json',
    /* Modrinth demande un User-Agent identifiant l'application. */
    'User-Agent': `NathMen12/Datapack-Maker/${config.appVersion} (github.com/NathMen12/Datapack-Maker)`,
  };
  if (token) headers.Authorization = token;
  return headers;
}

async function toModrinthError(res) {
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.description || data?.error || '';
  } catch { /* corps non JSON */ }
  if (res.status === 401) return new ModrinthError('modrinth_invalid_token', detail || 'invalid token', 401);
  if (res.status === 403) return new ModrinthError('modrinth_forbidden', detail || 'missing scope', 403);
  if (res.status === 404) return new ModrinthError('modrinth_not_found', detail || 'not found', 404);
  if (res.status === 429) return new ModrinthError('modrinth_rate_limited', detail || 'rate limited', 429);
  if (res.status === 410) return new ModrinthError('modrinth_api_deprecated', detail || 'API gone', 502);
  return new ModrinthError('modrinth_error', detail || `HTTP ${res.status}`, res.status >= 500 ? 502 : 400);
}

/* Requete JSON generique (GET/POST/PATCH/DELETE). */
async function request(path, { token, method = 'GET', body } = {}) {
  const headers = baseHeaders(token);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${config.modrinthApiBase}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.alert('Modrinth injoignable:', err.message);
    throw new ModrinthError('modrinth_unreachable', err.message, 502);
  }
  if (!res.ok) throw await toModrinthError(res);
  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* --- Lecture --- */

export function getAccount(token) {
  return request('/user', { token });
}

export function listUserProjects(token, userIdOrName) {
  return request(`/user/${encodeURIComponent(userIdOrName)}/projects`, { token });
}

export function getProject(idOrSlug) {
  return request(`/project/${encodeURIComponent(idOrSlug)}`);
}

export function listVersions(idOrSlug) {
  return request(`/project/${encodeURIComponent(idOrSlug)}/version?include_changelog=false`);
}

export function isValidProjectRef(ref) {
  return typeof ref === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(ref.trim());
}

/* --- Authentification / compte --- */

/* Verifie le jeton aupres de l'API et renvoie le compte associe
   (GET /user exige un jeton valide avec le scope USER_READ). */
export function checkToken(token) {
  return request('/user', { token });
}

/* --- Gestion des numeros de version --- */

/* « v1.2.3-beta » -> [1,2,3] (null si aucun nombre exploitable). */
export function parseVersionNumber(value) {
  const m = String(value || '').match(/\d+(?:\.\d+)*/);
  if (!m) return null;
  return m[0].split('.').map((n) => Number(n));
}

export function compareVersionNumbers(a, b) {
  const pa = parseVersionNumber(a) || [];
  const pb = parseVersionNumber(b) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function latestVersion(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list
    .slice()
    .sort((a, b) => compareVersionNumbers(b?.version_number, a?.version_number))[0];
}

/* Proposition de numero suivant : 1.0.0 -> 1.0.1, 2.1 -> 2.2, 1 -> 2.
   En l'absence de version publiee, on part de la derniere publiee connue
   en base, sinon de 1.0.0. */
export function suggestNextVersion(versions, fallbackNumber = '') {
  const last = latestVersion(versions);
  const base = last?.version_number || fallbackNumber || '';
  const parts = parseVersionNumber(base);
  if (!parts) return '1.0.0';
  if (parts.length === 1) return `${parts[0] + 1}`;
  parts[parts.length - 1] += 1;
  return parts.join('.');
}

/* --- Publication d'une version (multipart) --- */

/* Envoie un ZIP a POST /version. Modrinth exige :
   - un champ `data` (JSON) decrivant la version,
   - un fichier par entree de `file_parts`,
   - `primary_file` designant le fichier principal.
   Scope requis sur le jeton : VERSION_CREATE. */
export async function createVersion({
  token, project_id, name, version_number, changelog = '', game_versions,
  loaders, version_type = 'release', featured, dependencies, status,
  file, extraFiles = [],
}) {
  const form = new FormData();
  const parts = [file, ...extraFiles].filter(Boolean);
  if (parts.length === 0) {
    throw new ModrinthError('modrinth_file_required', 'a file is required', 400);
  }
  const fileParts = parts.map((_, i) => `file${i}`);
  parts.forEach((f, i) => {
    const blob = new Blob([f.buffer], { type: 'application/zip' });
    form.append(fileParts[i], blob, f.name);
  });

  const data = {
    project_id,
    name,
    version_number,
    changelog,
    game_versions,
    loaders,
    version_type,
    file_parts: fileParts,
    primary_file: fileParts[0],
  };
  if (featured !== undefined) data.featured = featured;
  if (dependencies) data.dependencies = dependencies;
  if (status) data.status = status;
  form.append('data', JSON.stringify(data));

  let res;
  try {
    res = await fetch(`${config.modrinthApiBase}/version`, {
      method: 'POST',
      headers: baseHeaders(token),
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    logger.alert('Modrinth injoignable (publication):', err.message);
    throw new ModrinthError('modrinth_unreachable', err.message, 502);
  }
  if (!res.ok) {
    /* Le detail d'erreur de Modrinth est indispensable pour diagnostiquer
       un refus (doublon de version_number, scope manquant...). */
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.description || body?.error || '';
      /* Erreurs de champ : Modrinth renvoie { errors: [{field, error}] }. */
      if (!detail && Array.isArray(body?.errors)) {
        detail = body.errors.map((e) => `${e.field || ''} ${e.error || ''}`.trim()).join('; ');
      }
    } catch { /* corps non JSON */ }
    const err = await toModrinthError(res);
    if (detail) err.message = detail;
    throw err;
  }
  return res.json();
}

let gameVersionsCache = { at: 0, value: null };

export async function getGameVersions() {
  if (gameVersionsCache.value && Date.now() - gameVersionsCache.at < GAME_VERSIONS_TTL_MS) {
    return gameVersionsCache.value;
  }
  const rows = await request('/tag/game_version');
  const value = (rows || []).map((v) => ({
    version: v.version,
    type: v.version_type,
    major: Boolean(v.major),
    date: v.date,
  }));
  gameVersionsCache = { at: Date.now(), value };
  return value;
}
