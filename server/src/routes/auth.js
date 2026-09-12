import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queries } from '../db/index.js';
import { issueToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/protect.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

const router = Router();

/* Cookie : httpOnly partout, secure en production (HTTPS). */
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: 7 * 24 * 3600 * 1000,
  path: '/',
};

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

function setAuthCookie(res, user) {
  res.cookie('token', issueToken(user), COOKIE_OPTS);
}

/* Inscription + connexion : limite stricte anti brute-force. */
router.post('/register', authLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.alert('Inscription invalide:', parsed.error.issues[0]?.message);
    return res.status(400).json({ error: 'invalid_input' });
  }
  const { email, username, password } = parsed.data;
  if (queries.getUserByEmail.get(email)) {
    logger.alert('Inscription: email deja utilise', email);
    return res.status(409).json({ error: 'email_taken' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = queries.insertUser.run(email, username, hash);
  const user = queries.getUserById.get(info.lastInsertRowid);
  setAuthCookie(res, user);
  logger.info('Nouvel utilisateur inscrit:', username);
  res.status(201).json({ user: { id: user.id, email: user.email, username: user.username } });
});

router.post('/login', authLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const { email, password } = parsed.data;
  const user = queries.getUserByEmail.get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logger.alert('Echec de connexion pour:', email);
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  setAuthCookie(res, user);
  logger.info('Utilisateur connecte:', user.username);
  res.json({ user: { id: user.id, email: user.email, username: user.username } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/', secure: config.isProd });
  logger.info('Utilisateur deconnecte');
  res.json({ ok: true });
});

export default router;
