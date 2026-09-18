#!/usr/bin/env node
/* ============================================================
   Test de bout en bout : partage temps reel + publication Modrinth.

   Deroule un FAUX serveur Modrinth en local, demarre l'API Datapack
   Maker avec MODRINTH_API_BASE pointant dessus, puis verifie :
     - les permissions (owner / editor / viewer) par role et par route ;
     - la diffusion temps reel des modifications (WebSocket) ;
     - la liaison d'un projet a Modrinth et le pre-remplissage du
       formulaire (version suivante, nom, versions de jeu compatibles) ;
     - la publication reelle d'un ZIP via POST /version.

   Usage : npm run smoke -w server
   ============================================================ */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

const API_PORT = Number(process.env.SMOKE_API_PORT || 40007);
const FAKE_PORT = Number(process.env.SMOKE_MODRINTH_PORT || 40099);
const API = `http://127.0.0.1:${API_PORT}`;
const DB_PATH = '/tmp/dm-smoke.db';

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \u001b[32mOK\u001b[0m   ${label}`);
  } else {
    failures.push(label);
    console.log(`  \u001b[31mFAIL\u001b[0m ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

/* ---------- Faux serveur Modrinth ---------- */

const modrinthState = {
  account: { id: 'MODUSER1', username: 'moddev', avatar_url: 'https://example.invalid/a.png' },
  project: {
    id: 'PROJID123',
    slug: 'test-datapack',
    title: 'Test Datapack',
    description: 'Datapack de test',
    project_type: 'datapack',
    loaders: ['datapack'],
    game_versions: ['1.21.8'],
    icon_url: 'https://example.invalid/icon.png',
  },
  versions: [
    {
      id: 'VER100',
      name: 'Test Datapack 1.0.0',
      version_number: '1.0.0',
      version_type: 'release',
      game_versions: ['1.21.8'],
      loaders: ['datapack'],
      downloads: 12,
      status: 'listed',
      date_published: '2026-01-02T10:00:00Z',
    },
  ],
  publishCalls: [],
  validToken: 'good-token',
};

const GAME_VERSIONS = ['1.20.1', '1.20.4', '1.21', '1.21.4', '1.21.5', '1.21.7', '1.21.8', '1.21.9'];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const fakeModrinth = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${FAKE_PORT}`);
  const authorized = (req.headers.authorization || '') === modrinthState.validToken;
  const p = url.pathname;
  const slug = modrinthState.project.slug;
  const id = modrinthState.project.id;

  if (p === '/user') {
    if (!authorized) return json(res, 401, { error: 'unauthorized', description: 'Invalid token' });
    return json(res, 200, modrinthState.account);
  }
  if (p === `/user/${modrinthState.account.id}/projects`) {
    if (!authorized) return json(res, 401, { error: 'unauthorized', description: 'Invalid token' });
    return json(res, 200, [modrinthState.project]);
  }
  if (p === `/project/${slug}` || p === `/project/${id}`) {
    return json(res, 200, modrinthState.project);
  }
  if (p === `/project/${slug}/version` || p === `/project/${id}/version`) {
    return json(res, 200, modrinthState.versions);
  }
  if (p === '/tag/game_version') {
    return json(res, 200, GAME_VERSIONS.map((v) => ({
      version: v, version_type: 'release', major: false, date: '2026-01-01T00:00:00Z',
    })));
  }
  if (p === '/version' && req.method === 'POST') {
    if (!authorized) return json(res, 401, { error: 'unauthorized', description: 'Invalid token' });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('latin1');
      const match = body.match(/"version_number":"([^"]+)"/);
      const versionNumber = match ? match[1] : '?';
      /* Le fichier doit arriver en multipart avec son nom et sa signature. */
      const hasFile = body.includes('filename="my-datapack.zip"') && body.includes('PK');
      if (!hasFile) return json(res, 400, { error: 'invalid_input', description: 'missing file' });
      modrinthState.publishCalls.push({ versionNumber, bodyLength: body.length });
      const created = {
        id: `VER${versionNumber}`,
        name: `Test Datapack ${versionNumber}`,
        version_number: versionNumber,
        version_type: 'release',
        game_versions: ['1.21.8'],
        loaders: ['datapack'],
        status: 'listed',
        date_published: new Date().toISOString(),
      };
      modrinthState.versions.push(created);
      return json(res, 200, created);
    });
    return undefined;
  }
  return json(res, 404, { error: 'not_found' });
});

/* ---------- Utilitaires ---------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* Libere un port TCP en tuant le processus qui l'ecoute.
   Utile pour relancer le test plusieurs fois de suite (ps/pgrep absents
   dans certains conteneurs : on passe par /proc). */
function freePort(port) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  const inode = new Set();
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      const local = parts[1].split(':')[1];
      if (local === hex && parts[3] === '0A') inode.add(parts[11]);
    }
  }
  if (inode.size === 0) return;
  for (const pid of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const fdDir = `/proc/${pid}/fd`;
    let fds;
    try { fds = fs.readdirSync(fdDir); } catch { continue; }
    for (const fd of fds) {
      let target;
      try { target = fs.readlinkSync(path.join(fdDir, fd)); } catch { continue; }
      const m = target.match(/^socket:\[(\d+)\]$/);
      if (m && inode.has(m[1])) {
        try {
          process.kill(Number(pid), 'SIGKILL');
          console.log(`  (port ${port} libere : pid ${pid} arrete)`);
        } catch { /* deja mort */ }
        return;
      }
    }
  }
}

/* ---------- Utilitaires HTTP ---------- */

const cookies = {};

/* fetch avec un petit retry : le premier appel apres le demarrage du
   serveur peut tomber sur ECONNRESET (socket acceptee puis coupee). */
async function call(pathname, { method = 'GET', body, as, headers = {} } = {}) {
  const payload = JSON.stringify(body);
  let res;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await fetch(`${API}${pathname}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(as ? { Cookie: cookies[as] } : {}),
          ...headers,
        },
        body: body !== undefined ? payload : undefined,
      });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(300 * (attempt + 1));
    }
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, data: await res.json().catch(() => null), setCookie };
}

async function register(who, email, username) {
  const r = await call('/api/auth/register', { method: 'POST', body: { email, username, password: 'password123' } });
  cookies[who] = (r.setCookie || []).map((c) => c.split(';')[0]).join('; ');
  return r;
}

/* ouvre une connexion WebSocket authentifiee et expose un `waitFor` pour
   attendre un type de message precis. */
function openSocket(who) {
  return new Promise((resolve, reject) => {
    const token = (cookies[who] || '').split('token=')[1];
    const ws = new WebSocket(`ws://127.0.0.1:${API_PORT}/ws?token=${token}`);
    const inbox = [];
    ws.inbox = inbox;
    ws.waitFor = (type, filter = () => true, timeoutMs = 5000) => new Promise((ok, ko) => {
      const found = inbox.find((m) => m.type === type && filter(m));
      if (found) {
        const idx = inbox.indexOf(found);
        if (idx !== -1) inbox.splice(idx, 1);
        return ok(found);
      }
      const timer = setTimeout(() => {
        ws.off('message', handler);
        ko(new Error(`timeout waiting for ${type} (recu: ${inbox.map((m) => JSON.stringify(m)).join(' | ')})`));
      }, timeoutMs);
      function handler(raw) {
        const m = JSON.parse(raw.toString());
        if (m.type !== type || !filter(m)) return;
        clearTimeout(timer);
        ws.off('message', handler);
        const idx = inbox.indexOf(m);
        if (idx !== -1) inbox.splice(idx, 1);
        ok(m);
      }
      ws.on('message', handler);
    });
    ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/* ZIP minimal mais valide (signature PK + entrees en stockage) : sert a
   verifier que le datapack est bien transmis en multipart/form-data. */
function makeZip() {
  const store = (name, content) => {
    const data = Buffer.from(content, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    return Buffer.concat([header, Buffer.from(name, 'utf8'), data]);
  };
  return Buffer.concat([
    store('pack.mcmeta', JSON.stringify({ pack: { pack_format: 81, description: 'smoke' } })),
    store('data/smokepack/function/main.mcfunction', 'say bonjour\n'),
  ]);
}

/* ---------- Scenario ---------- */

async function main() {
  fs.rmSync(DB_PATH, { force: true });
  /* Libere les ports si une execution precedente tourne encore. */
  freePort(API_PORT);
  freePort(FAKE_PORT);
  await sleep(200);
  await new Promise((r) => fakeModrinth.listen(FAKE_PORT, '127.0.0.1', r));
  console.log(`Faux serveur Modrinth sur http://127.0.0.1:${FAKE_PORT}`);

  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      DB_PATH,
      JWT_SECRET: 'smoke-secret',
      TOKEN_SECRET: 'smoke-token-secret',
      MODRINTH_API_BASE: `http://127.0.0.1:${FAKE_PORT}`,
      GROQ_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  server.stdout.on('data', (d) => serverLog.push(d.toString()));
  server.stderr.on('data', (d) => serverLog.push(d.toString()));

  /* Attente de disponibilite de l'API. */
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    try {
      const r = await fetch(`${API}/api/health`);
      up = r.ok;
    } catch { /* pas encore pret */ }
    if (!up) await new Promise((r) => setTimeout(r, 200));
  }
  if (!up) {
    console.error('API injoignable :\n', serverLog.join(''));
    process.exit(1);
  }

  console.log('\n== Authentification ==');
  const owner = await register('owner', 'owner@smoke.dev', 'owner1');
  const editor = await register('editor', 'editor@smoke.dev', 'editor1');
  const viewer = await register('viewer', 'viewer@smoke.dev', 'viewer1');
  check('inscription proprietaire', owner.status === 201, `status ${owner.status}`);
  check('inscription editeur', editor.status === 201, `status ${editor.status}`);
  check('inscription lecteur', viewer.status === 201, `status ${viewer.status}`);
  const editorId = editor.data?.user?.id;
  const viewerId = viewer.data?.user?.id;

  console.log('\n== Creation du projet ==');
  const created = await call('/api/projects', {
    method: 'POST',
    as: 'owner',
    body: { name: 'Smoke Pack', namespace: 'smokepack', minecraftVersion: '1.21.8', description: 'test' },
  });
  check('projet cree', created.status === 201, `status ${created.status}`);
  const projectId = created.data?.project?.id;
  check('role owner renvoye', created.data?.project?.role === 'owner');

  console.log('\n== Partage : invitation et permissions ==');
  const inviteEditor = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'owner', body: { email: 'editor@smoke.dev', role: 'editor' },
  });
  check('invitation editeur (201)', inviteEditor.status === 201, `status ${inviteEditor.status}`);
  check('editeur liste', inviteEditor.data?.collaborators?.some((c) => c.userId === editorId && c.role === 'editor'));

  const inviteViewer = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'owner', body: { username: 'viewer1', role: 'viewer' },
  });
  check('invitation lecteur par pseudo', inviteViewer.status === 201, `status ${inviteViewer.status}`);

  const duplicate = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'owner', body: { email: 'editor@smoke.dev', role: 'viewer' },
  });
  check(
    're-invitation = mise a jour du role',
    duplicate.status === 200 && duplicate.data?.collaborators?.find((c) => c.userId === editorId)?.role === 'viewer',
  );

  await call(`/api/projects/${projectId}/collaborators/${editorId}`, { method: 'PATCH', as: 'owner', body: { role: 'editor' } });

  const unknownUser = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'owner', body: { email: 'inconnu@smoke.dev', role: 'editor' },
  });
  check('invitation utilisateur inconnu -> 404', unknownUser.status === 404, `status ${unknownUser.status}`);

  const editorInvites = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'editor', body: { email: 'viewer@smoke.dev', role: 'viewer' },
  });
  check('editeur ne peut pas inviter -> 403', editorInvites.status === 403, `status ${editorInvites.status}`);

  const sharedList = await call('/api/projects/me', { as: 'editor' });
  check('projet partage visible pour l editeur', sharedList.data?.projects?.some((p) => p.id === projectId && p.role === 'editor' && p.shared));

  const writeAsViewer = await call(`/api/projects/${projectId}/files`, {
    method: 'PUT', as: 'viewer', body: { saves: [{ path: 'data/smokepack/function/a.mcfunction', content: 'say hi' }], deletes: [] },
  });
  check('lecteur ne peut pas ecrire -> 403', writeAsViewer.status === 403, `status ${writeAsViewer.status}`);

  const writeAsEditor = await call(`/api/projects/${projectId}/files`, {
    method: 'PUT', as: 'editor', body: { saves: [{ path: 'data/smokepack/function/a.mcfunction', content: 'say hi' }], deletes: [] },
  });
  check('editeur peut ecrire', writeAsEditor.status === 200, `status ${writeAsEditor.status}`);

  const renameAsEditor = await call(`/api/projects/${projectId}`, {
    method: 'PATCH', as: 'editor', body: { name: 'Renomme par editeur' },
  });
  check('editeur ne peut pas modifier les reglages -> 403', renameAsEditor.status === 403, `status ${renameAsEditor.status}`);

  const anonymous = await call(`/api/projects/${projectId}`);
  check('acces refuse sans session -> 401', anonymous.status === 401, `status ${anonymous.status}`);

  console.log('\n== Presence temps reel (WebSocket) ==');
  const wsOwner = await openSocket('owner');
  wsOwner.send(JSON.stringify({ type: 'join', projectId }));
  await wsOwner.waitFor('ready', (m) => m.projectId === projectId);
  const wsEditor = await openSocket('editor');
  wsEditor.send(JSON.stringify({ type: 'join', projectId }));
  const editorReady = await wsEditor.waitFor('ready', (m) => m.projectId === projectId);
  check('l editeur rejoint en tant qu editeur', editorReady.role === 'editor', JSON.stringify(editorReady));

  const presence = await wsEditor.waitFor('presence', (m) => m.projectId === projectId);
  check('presence contient les deux membres', presence.users?.length === 2, JSON.stringify(presence.users));

  const ownerSeesChange = wsOwner.waitFor('file:change', (m) => m.projectId === projectId);
  wsEditor.send(JSON.stringify({ type: 'file:change', projectId, path: 'data/smokepack/function/a.mcfunction', content: 'say bonjour' }));
  const change = await ownerSeesChange;
  check(
    'modification diffusee en temps reel',
    change.path === 'data/smokepack/function/a.mcfunction' && change.by === 'editor1',
    JSON.stringify(change),
  );

  const wsViewer = await openSocket('viewer');
  wsViewer.send(JSON.stringify({ type: 'join', projectId }));
  await wsViewer.waitFor('ready', (m) => m.projectId === projectId);
  const viewerForbidden = wsViewer.waitFor('error');
  wsViewer.send(JSON.stringify({ type: 'file:change', projectId, path: 'data/smokepack/function/b.mcfunction', content: 'say non' }));
  const forbidden = await viewerForbidden;
  check('lecteur ne peut pas diffuser -> forbidden', forbidden.code === 'forbidden', JSON.stringify(forbidden));

  const removalNotice = wsEditor.waitFor('project:removed');
  await call(`/api/projects/${projectId}/collaborators/${editorId}`, { method: 'DELETE', as: 'owner' });
  const removed = await removalNotice;
  check('retrait notifie en direct au membre', removed.projectId === projectId, JSON.stringify(removed));

  const afterRemoval = await call(`/api/projects/${projectId}/files`, { as: 'editor' });
  check('acces revoque -> 404', afterRemoval.status === 404, `status ${afterRemoval.status}`);

  const selfLeave = await call(`/api/projects/${projectId}/collaborators/${viewerId}`, { method: 'DELETE', as: 'viewer' });
  check('un membre peut se retirer lui-meme', selfLeave.status === 200, `status ${selfLeave.status}`);

  wsOwner.close();
  wsEditor.close();
  wsViewer.close();

  /* L editeur a ete retire pendant la section temps reel : on le re-invite
     pour les tests d autorisation Modrinth ci-dessous. */
  const reInvite = await call(`/api/projects/${projectId}/collaborators`, {
    method: 'POST', as: 'owner', body: { email: 'editor@smoke.dev', role: 'editor' },
  });
  check('re-invitation de l editeur apres retrait', reInvite.status === 201, `status ${reInvite.status}`);

  const noToken = await call(`/api/projects/${projectId}/modrinth`, { as: 'owner' });
  check('etat initial : non lie, sans jeton', noToken.status === 200 && noToken.data?.linked === false && noToken.data?.tokenLinked === false);

  console.log('\n== Modrinth : jeton et liaison ==');
  const badToken = await call('/api/modrinth/token', { method: 'PUT', as: 'owner', body: { token: 'mauvais-jeton-123' } });
  check('jeton invalide refuse -> 401', badToken.status === 401, `status ${badToken.status}`);

  const goodToken = await call('/api/modrinth/token', { method: 'PUT', as: 'owner', body: { token: 'good-token' } });
  check('jeton valide accepte', goodToken.status === 200 && goodToken.data?.account?.username === 'moddev', JSON.stringify(goodToken.data));

  const account = await call('/api/modrinth/account', { as: 'owner' });
  check('compte Modrinth retrouve', account.data?.account?.valid === true && account.data?.account?.linked === true);
  check('jeton jamais renvoye au client', !JSON.stringify(account.data).includes('good-token'));

  const userProjects = await call('/api/modrinth/projects', { as: 'owner' });
  check('projets Modrinth listes', Boolean(userProjects.data?.projects?.some((p) => p.slug === 'test-datapack')));

  const badLink = await call(`/api/projects/${projectId}/modrinth`, { method: 'PUT', as: 'owner', body: { project: 'projet-inexistant' } });
  check('liaison vers un projet inconnu -> 404', badLink.status === 404, `status ${badLink.status}`);

  const linkAsEditor = await call(`/api/projects/${projectId}/modrinth`, { method: 'PUT', as: 'editor', body: { project: 'test-datapack' } });
  check('liaison refusee aux non-proprietaires -> 403', linkAsEditor.status === 403, `status ${linkAsEditor.status}`);

  const link = await call(`/api/projects/${projectId}/modrinth`, { method: 'PUT', as: 'owner', body: { project: 'test-datapack' } });
  check('liaison au projet Modrinth', link.status === 200 && link.data?.ref === 'test-datapack', JSON.stringify(link.data));

  console.log('\n== Modrinth : pre-remplissage du formulaire ==');
  const inspect = await call(`/api/projects/${projectId}/modrinth`, { as: 'owner' });
  check('projet lie detecte', inspect.data?.linked === true);
  check('titre Modrinth remonte', inspect.data?.project?.title === 'Test Datapack');
  check('derniere version publiee 1.0.0', inspect.data?.lastVersionNumber === '1.0.0', inspect.data?.lastVersionNumber);
  check('version proposee 1.0.1', inspect.data?.suggestedVersionNumber === '1.0.1', inspect.data?.suggestedVersionNumber);
  check('nom propose auto-complete', inspect.data?.suggestedName === 'Test Datapack 1.0.1', inspect.data?.suggestedName);
  check(
    'versions de jeu compatibles (pack_format 81 -> 1.21.7 + 1.21.8)',
    JSON.stringify(inspect.data?.suggestedGameVersions) === JSON.stringify(['1.21.7', '1.21.8']),
    JSON.stringify(inspect.data?.suggestedGameVersions),
  );
  check('versions publiees listees', inspect.data?.publishedVersions?.[0]?.versionNumber === '1.0.0');

  const editorInspect = await call(`/api/projects/${projectId}/modrinth`, { as: 'editor' });
  check('consultation autorisee pour un editeur', editorInspect.status === 200 && editorInspect.data?.role === 'editor');

  console.log('\n== Modrinth : publication ==');
  const zipBase64 = makeZip().toString('base64');
  const invalidZip = await call(`/api/projects/${projectId}/modrinth/publish`, {
    method: 'POST', as: 'owner',
    body: { zip: Buffer.from('pas un zip').toString('base64'), versionNumber: '1.0.1', name: 'Test 1.0.1', gameVersions: ['1.21.8'] },
  });
  check('ZIP invalide refuse', invalidZip.status === 400 && invalidZip.data?.error === 'invalid_zip', JSON.stringify(invalidZip.data));

  const publishAsEditor = await call(`/api/projects/${projectId}/modrinth/publish`, {
    method: 'POST', as: 'editor',
    body: { zip: zipBase64, versionNumber: '1.0.1', name: 'Test 1.0.1', gameVersions: ['1.21.8'] },
  });
  check('publication refusee aux non-proprietaires -> 403', publishAsEditor.status === 403, `status ${publishAsEditor.status}`);

  const publish = await call(`/api/projects/${projectId}/modrinth/publish`, {
    method: 'POST', as: 'owner',
    body: {
      zip: zipBase64,
      fileName: 'my-datapack.zip',
      versionNumber: inspect.data.suggestedVersionNumber,
      name: inspect.data.suggestedName,
      changelog: 'Corrections diverses',
      gameVersions: inspect.data.suggestedGameVersions,
      versionType: 'release',
    },
  });
  check('publication reussie (201)', publish.status === 201, `status ${publish.status} ${JSON.stringify(publish.data)}`);
  check('version renvoyee 1.0.1', publish.data?.version?.versionNumber === '1.0.1');
  check(
    'lien vers la version Modrinth',
    /modrinth\.com\/datapack\/test-datapack\/version\/1\.0\.1$/.test(publish.data?.version?.url || ''),
    publish.data?.version?.url,
  );
  check('version suivante proposee 1.0.2', publish.data?.nextVersionNumber === '1.0.2', publish.data?.nextVersionNumber);
  check('ZIP transmis a Modrinth en multipart', modrinthState.publishCalls.some((c) => c.versionNumber === '1.0.1'));

  const afterPublish = await call(`/api/projects/${projectId}/modrinth`, { as: 'owner' });
  check('prochaine publication pre-remplie avec 1.0.2', afterPublish.data?.suggestedVersionNumber === '1.0.2', afterPublish.data?.suggestedVersionNumber);
  check('nom de la prochaine version auto-complete', afterPublish.data?.suggestedName === 'Test Datapack 1.0.2', afterPublish.data?.suggestedName);

  console.log('\n== Modrinth : deliaison et jeton manquant ==');
  const unlinked = await call(`/api/projects/${projectId}/modrinth`, { method: 'DELETE', as: 'owner' });
  check('deliaison du projet', unlinked.status === 200 && unlinked.data?.linked === false);

  const publishUnlinked = await call(`/api/projects/${projectId}/modrinth/publish`, {
    method: 'POST', as: 'owner', body: { zip: zipBase64, versionNumber: '2.0.0', name: 'x', gameVersions: ['1.21.8'] },
  });
  check('publication sans liaison -> modrinth_not_linked', publishUnlinked.data?.error === 'modrinth_not_linked', JSON.stringify(publishUnlinked.data));

  await call(`/api/projects/${projectId}/modrinth`, { method: 'PUT', as: 'owner', body: { project: 'test-datapack' } });
  const tokenRemoved = await call('/api/modrinth/token', { method: 'DELETE', as: 'owner' });
  check('suppression du jeton', tokenRemoved.status === 200 && tokenRemoved.data?.account?.linked === false);

  const publishNoToken = await call(`/api/projects/${projectId}/modrinth/publish`, {
    method: 'POST', as: 'owner', body: { zip: zipBase64, versionNumber: '2.0.0', name: 'x', gameVersions: ['1.21.8'] },
  });
  check('publication sans jeton -> modrinth_token_required', publishNoToken.data?.error === 'modrinth_token_required', JSON.stringify(publishNoToken.data));

  server.kill('SIGTERM');
  fakeModrinth.close();

  console.log(`\n${'='.repeat(52)}`);
  if (failures.length) {
    console.log(`\u001b[31m${failures.length} test(s) en echec\u001b[0m sur ${passed + failures.length}`);
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\nDernieres lignes du serveur :');
    console.log(serverLog.join('').split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
  console.log(`\u001b[32mTous les tests passent\u001b[0m (${passed})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Echec du harnais de test :', err);
  process.exit(1);
});


