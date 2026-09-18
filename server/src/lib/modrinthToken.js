import { queries } from '../db/index.js';
import { seal, open } from './secretBox.js';

/* ============================================================
   Jeton Modrinth personnel, stocke chiffre en base (users.modrinth_token).

   Le jeton n'est JAMAIS renvoye au client : seule sa presence
   (`hasToken`) et le compte Modrinth associe sont exposes.
   ============================================================ */

export function getUserToken(userId) {
  const row = queries.getModrinthToken.get(userId);
  return open(row?.modrinth_token || '');
}

export function saveUserToken(userId, token) {
  queries.setModrinthToken.run(seal(String(token).trim()), userId);
}

export function clearUserToken(userId) {
  queries.setModrinthToken.run('', userId);
}