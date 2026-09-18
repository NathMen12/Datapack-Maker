import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getUserToken, saveUserToken, clearUserToken } from '../lib/modrinthToken.js';
import { ModrinthError, checkToken, getGameVersions, listUserProjects } from '../services/modrinth.js';
import { logger } from '../lib/logger.js';

/* ============================================================
   Compte Modrinth de l'utilisateur connecte (monte sur /api/modrinth).

     GET    /account        etat du jeton + compte Modrinth
     PUT    /token          enregistre un jeton (verifie aupres de l'API)
     DELETE /token          supprime le jeton
     GET    /game-versions  versions de Minecraft connues de Modrinth
     GET    /projects       projets Modrinth de l'utilisateur (pour lier)

   Le jeton n'est jamais renvoye au client.
   ============================================================ */

const router = Router();
router.use(requireAuth);

const tokenSchema = z.object({ token: z.string().trim().min(8).max(256) });

/* Message d'erreur exploitable par l'interface. */
function fail(res, err) {
  if (err instanceof ModrinthError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  logger.error('Modrinth (compte):', err.message);
  return res.status(502).json({ error: 'modrinth_error', message: err.message });
}

router.get('/account', async (req, res) => {
  const token = getUserToken(req.user.id);
  if (!token) return res.json({ account: { linked: false, valid: false, username: '' } });
  try {
    const user = await checkToken(token);
    res.json({ account: { linked: true, valid: true, id: user.id, username: user.username, avatar: user.avatar } });
  } catch (err) {
    /* Jeton enregistre mais refuse (revoque cote Modrinth) : on le signale
       sans le supprimer, l'utilisateur decide de le remplacer. */
    res.json({
      account: { linked: true, valid: false, username: '', error: err.code || 'modrinth_error', message: err.message },
    });
  }
});

router.put('/token', async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const token = parsed.data.token;
  try {
    /* Verification AVANT enregistrement : un jeton invalide ne sature pas la base. */
    const user = await checkToken(token);
    saveUserToken(req.user.id, token);
    logger.info(`Modrinth: jeton enregistre pour ${req.user.username} (${user.username})`);
    res.json({ account: { linked: true, valid: true, id: user.id, username: user.username, avatar: user.avatar } });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/token', (req, res) => {
  clearUserToken(req.user.id);
  res.json({ account: { linked: false, valid: false, username: '' } });
});

/* Cache memoire des tags (1 h) : evite un appel API a chaque ouverture du
   formulaire de publication. */
router.get('/game-versions', async (req, res) => {
  try {
    const versions = await getGameVersions();
    res.json({ versions });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/projects', async (req, res) => {
  const token = getUserToken(req.user.id);
  if (!token) return res.status(400).json({ error: 'modrinth_token_required' });
  try {
    const account = await checkToken(token);
    const rows = await listUserProjects(token, account.id);
    res.json({
      projects: (rows || []).map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        projectType: p.project_type,
        iconUrl: p.icon_url,
        versions: p.game_versions || [],
        loaders: p.loaders || [],
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
