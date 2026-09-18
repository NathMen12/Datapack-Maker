/* ============================================================
   Client WebSocket temps reel (collaboration sur un projet).

   Une seule connexion par page, montee sur /ws (meme origine :
   proxy Vite en dev, API Express en production). Le JWT part
   automatiquement via le cookie httpOnly — rien a signer ici.

   API :
     realtime.on('presence'|'file:change'|..., cb) / off(type, cb)
     realtime.join(projectId) — rejoint la salle du projet ouvert
     realtime.leave()         — quitte la salle
     realtime.fileChange(projectId, path, content)
     realtime.fileDelete(projectId, path)

   Le serveur ne persiste RIEN ici : la sauvegarde passe par l'API
   REST, le WebSocket ne fait que diffuser aux autres membres.
   ============================================================ */

const listeners = new Map();

function emit(msg) {
  const cbs = listeners.get(msg.type);
  if (!cbs) return;
  for (const cb of [...cbs]) {
    try { cb(msg); } catch (err) { console.error('realtime listener', err); }
  }
}

class Realtime {
  constructor() {
    this.ws = null;
    this.joined = null;
    this.attempt = 0;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    clearTimeout(this.reconnectTimer);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      /* Rejoindre automatiquement la salle apres une reconnexion. */
      if (this.joined !== null) this.send({ type: 'join', projectId: this.joined });
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      emit(msg);
    };
    ws.onclose = (e) => {
      this.ws = null;
      if (this.stopped) return;
      /* 4401 : session expiree — inutile d'insister, l'utilisateur se
         reconnectera (et rejoindra) a la prochaine action. */
      if (e.code === 4401) return;
      const delay = Math.min(30_000, 800 * 2 ** this.attempt);
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* deja fermee */ } };
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  join(projectId) {
    const pid = Number(projectId);
    if (!Number.isInteger(pid) || pid <= 0) return;
    const changed = this.joined !== pid;
    this.joined = pid;
    this.stopped = false;
    if (!this.ws) this.connect();
    else if (changed) this.send({ type: 'join', projectId: pid });
  }

  leave() {
    if (this.joined !== null) this.send({ type: 'leave' });
    this.joined = null;
  }

  fileChange(projectId, path, content) {
    this.send({ type: 'file:change', projectId, path, content });
  }

  fileDelete(projectId, path) {
    this.send({ type: 'file:delete', projectId, path });
  }

  on(type, cb) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(cb);
  }

  off(type, cb) {
    listeners.get(type)?.delete(cb);
  }
}

export const realtime = new Realtime();
export default realtime;