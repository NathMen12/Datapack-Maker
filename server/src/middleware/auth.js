import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.token || null;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenValue = token || bearer;
  if (!tokenValue) {
    return res.status(401).json({ error: 'auth_required' });
  }
  try {
    const payload = jwt.verify(tokenValue, config.jwtSecret);
    req.user = { id: payload.uid, email: payload.email, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export function issueToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, username: user.username },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}
