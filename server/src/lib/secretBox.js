import crypto from 'node:crypto';
import { config } from '../config.js';

/* ============================================================
   Chiffrement au repos des secrets tiers (jeton Modrinth).

   Le jeton est chiffre en AES-256-GCM avec une cle derivee (scrypt)
   du secret serveur : la base SQLite ne contient jamais le jeton en
   clair. Format stocke : v1:<base64(salt|iv|tag|ciphertext)>.

   Limite : si TOKEN_SECRET / JWT_SECRET change, les jetons stockes
   deviennent illisibles (l'utilisateur doit les resaisir).
   ============================================================ */

const VERSION = 'v1';
const SALT_LEN = 16;
const IV_LEN = 12;

function keyFrom(secret, salt) {
  /* scrypt : derive une cle de 32 octets resistante au force brute. */
  return crypto.scryptSync(secret, salt, 32);
}

export function seal(plaintext) {
  if (!plaintext) return '';
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(config.tokenSecret, salt), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([salt, iv, tag, data]).toString('base64')}`;
}

export function open(sealed) {
  if (!sealed || typeof sealed !== 'string') return '';
  const [version, payload] = sealed.split(':');
  if (version !== VERSION || !payload) return '';
  try {
    const raw = Buffer.from(payload, 'base64');
    const salt = raw.subarray(0, SALT_LEN);
    const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + 16);
    const data = raw.subarray(SALT_LEN + IV_LEN + 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(config.tokenSecret, salt), iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    /* Cle serveur differente ou donnee corrompue : on ignore. */
    return '';
  }
}
