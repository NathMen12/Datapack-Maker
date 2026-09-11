import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { queries } from '../db/index.js';

const router = Router();

/* Profil de l'utilisateur connecte (utilise aussi par le client au demarrage). */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* Migration local -> cloud : creation d'un projet + tous ses fichiers en une requete. */
router.post('/migrate', requireAuth, (req, res) => {
  res.status(410).json({ error: 'use POST /api/projects with files instead' });
});

export default router;
