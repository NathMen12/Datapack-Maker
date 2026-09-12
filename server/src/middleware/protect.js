import rateLimit from 'express-rate-limit';

/* ============================================================
   Limites de debit (anti brute-force et anti-abus).
   - authLimiter : tres strict sur register/login (10 / 15 min / IP)
   - apiLimiter  : plafond general raisonnable sur toute l API
   ============================================================ */

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
