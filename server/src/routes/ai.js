import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { queries } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { completeMcfunction } from '../services/groq.js';
import { logger } from '../lib/logger.js';

const router = Router();

const today = () => new Date().toISOString().slice(0, 10);

function usagePercent(userId) {
  const row = queries.getUsage.get(userId, today());
  const used = row?.tokens_used || 0;
  return Math.min(100, Math.round((used / config.aiQuotaTokens) * 100));
}

/* Quota public (affichage dashboard) : uniquement en pourcentage, pas de tokens bruts. */
router.get('/quota', requireAuth, (req, res) => {
  res.json({ percentUsed: usagePercent(req.user.id) });
});

const completeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

const completeSchema = z.object({
  prefix: z.string().max(300),
  context: z.string().max(4000),
  fileName: z.string().max(200).optional(),
});

router.post('/complete', requireAuth, completeLimiter, async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input' });
  }

  const percent = usagePercent(req.user.id);
  if (percent >= 100) {
    logger.alert(`Quota IA atteint pour l'utilisateur #${req.user.id}`);
    return res.status(403).json({ error: 'quota_exceeded', percentUsed: 100 });
  }

  try {
    const { completion, tokens } = await completeMcfunction(parsed.data);
    queries.addUsage.run(req.user.id, today(), tokens);
    const newPercent = usagePercent(req.user.id);
    if (newPercent >= 90) {
      logger.alert(`Quota IA a ${newPercent}% pour l'utilisateur #${req.user.id}`);
    }
    logger.info(`Completion IA (${tokens} tokens) pour l'utilisateur #${req.user.id}`);
    res.json({ completion, percentUsed: newPercent });
  } catch (err) {
    logger.error('Erreur Groq:', err.message);
    res.status(err.status || 500).json({ error: 'ai_error', message: err.message });
  }
});

export default router;
