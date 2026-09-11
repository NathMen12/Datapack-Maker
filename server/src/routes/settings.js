import { Router } from 'express';
import { z } from 'zod';
import { queries } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const settingsSchema = z.object({
  language: z.enum(['fr', 'en']).optional(),
  autocompleteEnabled: z.boolean().optional(),
  autocompleteDelay: z.number().int().min(100).max(3000).optional(),
  theme: z.enum(['dark', 'light']).optional(),
  fontSize: z.number().int().min(10).max(24).optional(),
  autosaveDelay: z.number().int().min(0).max(10000).optional(),
});

router.get('/', requireAuth, (req, res) => {
  let settings = {};
  try {
    settings = JSON.parse(queries.getUserById.get(req.user.id)?.settings || '{}');
  } catch {
    settings = {};
  }
  res.json({ settings });
});

router.patch('/', requireAuth, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_input', details: parsed.error.issues });
  }
  const current = JSON.parse(queries.getUserById.get(req.user.id)?.settings || '{}');
  const next = { ...current, ...parsed.data };
  queries.updateSettings.run(JSON.stringify(next), req.user.id);
  res.json({ settings: next });
});

export default router;
