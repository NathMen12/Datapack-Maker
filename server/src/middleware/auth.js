import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queries } from '../db/index.js';

/* Verifie le JWT ET l'existence reelle de l'utilisateur en base.
   Un token valide 7 jours peut survivre a une reinitialisation de la base :
   sans cette verification, toute ecriture echoue avec FOREIGN KEY constraint. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.token || null;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenValue = token || bearer;
  if (!tokenValue) {
    return res.status(401).json({ error: 'auth_required' });
  }
  let payload;
  try {
    payload = jwt.verify(tokenValue, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
  /* L'utilisateur doit exister en base (sinon : compte supprime ou base reinitialisee). */
  const user = queries.getUserById.get(payload.uid);
  if (!user) {
    return res.status(401).json({ error: 'user_not_found' });
  }
  req.user = { id: user.id, email: user.email, username: user.username };
  next();
}

export function issueToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, username: user.username },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}
