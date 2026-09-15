import { config } from '../config.js';

/* ============================================================
   CORS maison, conscient du same-origin.
   - Requete sans Origin (curl, navigation directe) : laisse passer.
   - Origin identique au Host (client servi par cette API, ex.
     http://127.0.0.1:3000) : same-origin, aucun en-tete CORS requis.
   - Origin listee dans CLIENT_ORIGIN (dev Vite 5173, etc.) : en-tetes CORS.
   - Tout le reste : 403 propre.
   ============================================================ */

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization';

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();

  const host = req.headers.host || '';
  const sameOrigin = origin === `http://${host}` || origin === `https://${host}`;

  if (!sameOrigin && !config.clientOrigins.includes(origin)) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }

  if (!sameOrigin) {
    /* Cross-origin autorise : en-tetes CORS necessaires. */
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      return res.status(204).end();
    }
  }
  return next();
}
