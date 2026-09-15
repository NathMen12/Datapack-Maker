import { openDB } from 'idb';

/* ============================================================
   Liaison projet <-> dossier du PC (File System Access API).
   - Navigateurs bases Chromium uniquement (showDirectoryPicker).
   - Le dossier (FileSystemDirectoryHandle) est persiste en
     IndexedDB : la liaison survit aux rechargements de page.
   - Apres un rechargement, le navigateur exige un clic
     utilisateur pour redonner l'autorisation d'ecriture.
   ============================================================ */

export function isFSAvailable() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

const DB_NAME = 'dpm-fs-links';
const STORE = 'handles';
let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

/* Defense en profondeur : memes regles que la validation serveur. */
function isSafePath(p) {
  return (
    typeof p === 'string' &&
    p.length > 0 &&
    p.length <= 255 &&
    !p.includes('..') &&
    !p.startsWith('/') &&
    !p.includes('\\') &&
    !p.includes('//') &&
    /^[a-zA-Z0-9_\-./]+$/.test(p)
  );
}

/* Ouvre le selecteur natif de dossier et memorise la liaison. */
export async function linkFolder(projectKey) {
  if (!isFSAvailable()) {
    const err = new Error('fs_unsupported');
    err.code = 'fs_unsupported';
    throw err;
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const db = await getDB();
  await db.put(STORE, handle, projectKey);
  return handle;
}

/* Handle memorise pour ce projet, ou null. */
export async function getLinkedFolder(projectKey) {
  try {
    const db = await getDB();
    return (await db.get(STORE, projectKey)) || null;
  } catch {
    return null;
  }
}

export async function unlinkFolder(projectKey) {
  try {
    const db = await getDB();
    await db.delete(STORE, projectKey);
  } catch { /* deja absent */ }
}

/* Autorisation deja accordee ? (sans geste utilisateur) */
export async function queryPermission(handle) {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/* Re-demande l'autorisation : DOIT etre appele depuis un clic. */
export async function requestPermission(handle) {
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

async function getDirHandle(root, parts) {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

/* Ecrit un fichier (en creant les dossiers parents au passage). */
export async function writeFsFile(root, path, content) {
  if (!isSafePath(path)) throw new Error('invalid_path');
  const parts = path.split('/');
  const name = parts.pop();
  const dir = await getDirHandle(root, parts);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

/* Supprime un fichier du dossier lie (best effort). */
export async function deleteFsFile(root, path) {
  if (!isSafePath(path)) return;
  const parts = path.split('/');
  const name = parts.pop();
  try {
    const dir = await getDirHandle(root, parts);
    await dir.removeEntry(name);
  } catch { /* fichier absent : rien a faire */ }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* Synchronisation complete : tous les fichiers + pack.png (icone).
   Les marqueurs .keep materialisent simplement un dossier vide. */
export async function writeProjectToFolder(root, { files, icon }) {
  for (const f of files || []) {
    if (!isSafePath(f.path)) continue;
    if (f.path.endsWith('/.keep') || f.path === '.keep') {
      await getDirHandle(root, f.path.split('/').slice(0, -1));
      continue;
    }
    await writeFsFile(root, f.path, f.content);
  }
  if (icon && /^data:image\/png;base64,/.test(icon)) {
    try {
      await writeFsFile(root, 'pack.png', base64ToBytes(icon.split(',')[1]));
    } catch { /* icone invalide : ignoree */ }
  }
}
