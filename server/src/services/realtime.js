import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { queries } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { roleOf, canWrite } from '../middleware/access.js';
import { filePath } from '../middleware/validate.js';

/* ============================================================
   Collaboration temps reel (WebSocket natif, monte sur /ws).

   Le client ouvre UNE connexion par session puis rejoint le projet
   ouvert avec { type: 'join', projectId }.

   Protocole (JSON) :
     client -> serveur : join | leave | ping | file:change | file:delete
     serveur -> client : ready | presence | file:change | file:delete |
                         project:changed | error

   Ecriture reservee aux roles editor/owner : un viewer qui tente
   d'emettre une modification recoit { type: 'error', code: 'forbidden' }.
   Le serveur ne persiste PAS les fichiers ici : la sauvegarde passe par
   l'API REST (PUT /api/projects/:id/files) et le WebSocket ne fait que
   diffuser la modification aux autres editeurs connectes.
   ============================================================ */

const MAX_FILE_CONTENT = 512 * 1024;
const HEARTBEAT_MS = 30_000;

/** projectId -> Map<ws, { userId, username, role }> */
const rooms = new Map();
/** userId -> Set<ws> (notifications personnelles : invitation, role change) */
const userSockets = new Map();

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), projectId: z.coerce.number().int().positive() }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping') }),
  z.object({
    type: z.literal('file:change'),
    projectId: z.coerce.number().int().positive(),
    path: filePath,
    content: z.string().max(MAX_FILE_CONTENT),
  }),
  z.object({
    type: z.literal('file:delete'),
    projectId: z.coerce.number().int().positive(),
    path: filePath,
  }),
]);

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* Authentification a la poignee de main : cookie httpOnly `token`
   (meme origine / proxy Vite) ou ?token= en secours. */
function authenticate(req) {
  let raw = null;
  try {
    const url = new URL(req.url, 'http://localhost');
    raw = url.searchParams.get('token');
  } catch { /* url invalide : on se rabat sur le cookie */ }
  if (!raw) raw = parseCookies(req.headers.cookie).token || null;
  if (!raw) return null;
  let payload;
  try {
    payload = jwt.verify(raw, config.jwtSecret);
  } catch {
    return null;
  }
  const user = queries.getUserById.get(payload.uid);
  if (!user) return null;
  return { id: user.id, username: user.username };
}

function send(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.alert('WebSocket: envoi impossible:', err.message);
  }
}

function roomOf(projectId) {
  if (!rooms.has(projectId)) rooms.set(projectId, new Map());
  return rooms.get(projectId);
}

/* Liste des utilisateurs connectes sur un projet (sans doublon). */
export function projectPresence(projectId) {
  const members = rooms.get(Number(projectId));
  if (!members) return [];
  const seen = new Map();
  for (const m of members.values()) seen.set(m.userId, { id: m.userId, username: m.username, role: m.role });
  return [...seen.values()].sort((a, b) => a.username.localeCompare(b.username));
}

function pushPresence(projectId) {
  const members = rooms.get(Number(projectId));
  if (!members) return;
  const users = projectPresence(projectId);
  for (const ws of members.keys()) send(ws, { type: 'presence', projectId: Number(projectId), users });
}

function leaveRoom(ws, projectId) {
  const id = Number(projectId);
  const members = rooms.get(id);
  if (!members) return;
  members.delete(ws);
  if (members.size === 0) rooms.delete(id);
  else pushPresence(id);
}

function currentRoom(ws) {
  for (const [projectId, members] of rooms) {
    if (members.has(ws)) return projectId;
  }
  return null;
}

/* Diffusion a tous les membres d'un projet (sauf un utilisateur si besoin). */
export function broadcastToProject(projectId, payload, { exceptUserId = null } = {}) {
  const members = rooms.get(Number(projectId));
  if (!members) return;
  for (const [sock, info] of members.entries()) {
    if (exceptUserId !== null && info.userId === exceptUserId) continue;
    send(sock, { ...payload, projectId: Number(projectId) });
  }
}

/* Notification ciblee (invitation, changement de role, retrait d'acces). */
export function broadcastToUser(userId, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const ws of sockets) send(ws, payload);
}

function handleJoin(ws, user, projectId) {
  const project = queries.getProjectById.get(projectId);
  const role = roleOf(project, user.id);
  if (!role) {
    send(ws, { type: 'error', code: 'project_not_found', projectId });
    return;
  }
  const previous = currentRoom(ws);
  if (previous !== null && previous !== projectId) leaveRoom(ws, previous);
  ws.projectId = projectId;
  roomOf(projectId).set(ws, { userId: user.id, username: user.username, role });
  send(ws, { type: 'ready', projectId, role, users: projectPresence(projectId) });
  pushPresence(projectId);
  logger.info(`Collaboration: ${user.username} (${role}) rejoint le projet ${projectId}`);
}

function handleFileEvent(ws, msg) {
  const project = queries.getProjectById.get(msg.projectId);
  const role = roleOf(project, ws.user.id);
  if (!canWrite(role)) {
    send(ws, { type: 'error', code: 'forbidden', projectId: msg.projectId });
    return;
  }
  const base = msg.type === 'file:change'
    ? { type: 'file:change', path: msg.path, content: msg.content }
    : { type: 'file:delete', path: msg.path };
  broadcastToProject(msg.projectId, { ...base, by: ws.user.username, userId: ws.user.id }, { exceptUserId: ws.user.id });
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const user = authenticate(req);
    if (!user) {
      send(ws, { type: 'error', code: 'auth_required' });
      ws.close(4401, 'auth_required');
      return;
    }
    ws.user = user;
    ws.isAlive = true;
    ws.projectId = null;
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id).add(ws);

    send(ws, { type: 'ready', user: { id: user.id, username: user.username } });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      if (raw.length > MAX_FILE_CONTENT * 2) {
        send(ws, { type: 'error', code: 'payload_too_large' });
        return;
      }
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', code: 'invalid_message' });
        return;
      }
      const parsed = messageSchema.safeParse(data);
      if (!parsed.success) {
        send(ws, { type: 'error', code: 'invalid_message' });
        return;
      }
      const msg = parsed.data;
      if (msg.type === 'ping') return send(ws, { type: 'pong' });
      if (msg.type === 'leave') {
        if (ws.projectId !== null) leaveRoom(ws, ws.projectId);
        ws.projectId = null;
        return;
      }
      if (msg.type === 'join') return handleJoin(ws, user, msg.projectId);
      return handleFileEvent(ws, msg);
    });

    ws.on('close', () => {
      if (ws.projectId !== null) leaveRoom(ws, ws.projectId);
      const set = userSockets.get(user.id);
      if (set) {
        set.delete(ws);
        if (set.size === 0) userSockets.delete(user.id);
      }
    });

    ws.on('error', (err) => logger.alert('WebSocket: erreur client:', err.message));
  });

  /* Battement de coeur : ferme les connexions mortes (onglet tue, reseau). */
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* socket deja ferme */ }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  wss.on('close', () => clearInterval(heartbeat));

  logger.info('Collaboration temps reel active (WebSocket /ws)');
  return wss;
}

export default attachRealtime;
