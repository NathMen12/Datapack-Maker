import { openDB } from 'idb';

/* ============================================================
   Stockage local (IndexedDB + compression gzip native).
   - Pas de crash au-dela de 5 Mo (contrairement a localStorage).
   - Chaque projet est compresse (gzip via CompressionStream).
   - QuotaExceededError gere proprement et remonte a l'UI.
   ============================================================ */

const DB_NAME = 'dpm-projects';
const DB_VERSION = 1;
export const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024; /* seuil d'avertissement : 50 Mo */

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('projects')) {
          const store = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_updated', 'updated_at');
        }
        if (!db.objectStoreNames.contains('files')) {
          const files = db.createObjectStore('files', { keyPath: [ 'projectId', 'path' ] });
          files.createIndex('by_project', 'projectId');
        }
      },
    });
  }
  return dbPromise;
}

/* --- Compression gzip native (fallback : texte brut) --- */
const supportsGzip = typeof CompressionStream !== 'undefined';

async function gzip(str) {
  if (!supportsGzip) return { data: str, compressed: false };
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data: buf, compressed: true };
}

async function gunzip(data, compressed) {
  if (!compressed) return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/* --- Gestion des erreurs de quota --- */
export class StorageFullError extends Error {
  constructor() {
    super('storage_full');
    this.name = 'StorageFullError';
  }
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) {
      throw new StorageFullError();
    }
    throw e;
  }
}

/* --- API publique --- */
export const localDB = {
  async listProjects() {
    const db = await getDB();
    const rows = await db.getAll('projects');
    return rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  },

  async getProject(id) {
    const db = await getDB();
    return db.get('projects', id);
  },

  async createProject(data) {
    const db = await getDB();
    const now = new Date().toISOString();
    const id = await guarded(() =>
      db.add('projects', {
        name: data.name,
        namespace: data.namespace,
        minecraft_version: data.minecraftVersion,
        description: data.description || '',
        icon: data.icon || '',
        created_at: now,
        updated_at: now,
      })
    );
    /* Retourne l'objet complet (id inclus), pas seulement la cle generee. */
    return db.get('projects', id);
  },

  async updateProject(id, patch) {
    const db = await getDB();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const row = await store.get(id);
    if (!row) return;
    const next = { ...row, ...clean, updated_at: new Date().toISOString() };
    await store.put(next);
    await tx.done;
  },

  async deleteProject(id) {
    const db = await getDB();
    const tx = db.transaction(['projects', 'files'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    const files = tx.objectStore('files');
    let cursor = await files.index('by_project').openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  },

  async listFiles(projectId) {
    const db = await getDB();
    const rows = await db.getAllFromIndex('files', 'by_project', projectId);
    const out = [];
    for (const r of rows) {
      out.push({ path: r.path, content: await gunzip(r.data, r.compressed) });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  },

  async saveFiles(projectId, saves, deletes = []) {
    const db = await getDB();
    await guarded(async () => {
      /* 1) Compresser AVANT d'ouvrir la transaction.
         Le gzip (CompressionStream) traverse plusieurs macrotaches :
         une transaction IndexedDB se fermerait automatiquement pendant
         l'attente, et les put suivants echoueraient avec
         "A request was placed against a transaction which is currently
         not active, or which is finished". */
      const prepared = [];
      for (const f of saves) {
        const { data, compressed } = await gzip(f.content);
        prepared.push({ projectId, path: f.path, data, compressed });
      }

      /* 2) Verifier le projet HORS transaction. */
      const row = await db.get('projects', projectId);
      /* Projet introuvable : on echoue proprement (pas de projet fantome). */
      if (!row) throw new Error('project_not_found');

      /* 3) Ouvrir la transaction et tout ecrire d'un bloc,
         sans aucune operation async non-IDB a l'interieur. */
      const tx = db.transaction(['files', 'projects'], 'readwrite');
      const files = tx.objectStore('files');
      for (const rec of prepared) files.put(rec);
      for (const del of deletes) files.delete([projectId, del]);
      tx.objectStore('projects').put({ ...row, updated_at: new Date().toISOString() });
      await tx.done;
    });
  },

  async upsertFile(projectId, path, content) {
    return this.saveFiles(projectId, [{ path, content }], []);
  },

  async estimateSize() {
    try {
      if (navigator.storage?.estimate) {
        const { usage = 0 } = await navigator.storage.estimate();
        return usage;
      }
    } catch { /* non supporte */ }
    const db = await getDB();
    const rows = await db.getAll('files');
    return rows.reduce((acc, r) => acc + (r.data?.byteLength || r.data?.length || 0), 0);
  },
};

export default localDB;
