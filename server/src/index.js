import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config, SERVER_ROOT } from './config.js';
import { logger, httpColor } from './lib/logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { apiLimiter } from './middleware/protect.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import projectsRoutes from './routes/projects.js';
import aiRoutes from './routes/ai.js';
import settingsRoutes from './routes/settings.js';
import modrinthRoutes from './routes/modrinth.js';
import { attachRealtime } from './services/realtime.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());

/* CORS conscient du same-origin : le client servi par cette meme API
   (port 40007) passe toujours, quelle que soit l ecriture de l hote
   (localhost / 127.0.0.1). Seules les origins externes listees dans
   CLIENT_ORIGIN sont acceptees pour le cross-origin (dev Vite 40071, prod). */
app.use(corsMiddleware);

/* Limite de corps : 1 Mo partout, sauf les routes projets (migration complete
   d un projet local->cloud + icones en data URI) qui admettent 12 Mo.
   NB : le parseur specifique doit etre declare AVANT le global, sinon le
   global (1 Mo) rejeterait les gros projets en premier. */
app.use('/api/projects', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '1mb' }));

app.use(cookieParser());

/* Journal des requetes, colore. Declare avant le rate-limit : ainsi les
   rejets 429 sont aussi journalises. */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} (${Date.now() - start}ms)`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.alert(line);
    else logger.info(line);
  });
  next();
});

/* Plafond general : 240 requetes/min/IP sur toute l API. */
app.use(apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true, model: config.aiModel }));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/modrinth', modrinthRoutes);

/* Servir le client build (client/dist) en production, si present. */
const CLIENT_DIST = path.resolve(SERVER_ROOT, '../client/dist');
if (fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

/* Gestionnaire d erreurs global : detail interne journalise, reponse opaque. */
app.use((err, req, res, next) => {
  if (err?.status === 413 || err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  logger.error('Erreur non geree:', err.message);
  res.status(500).json({ error: 'internal_error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Serveur demarre sur le port ${config.port} (${config.env})`);
  logger.info(`Modele IA: ${config.aiModel} | Quota: ${config.aiQuotaTokens} tokens/jour/utilisateur`);
  if (!config.groqApiKey) {
    logger.alert('GROQ_API_KEY absente: l\'autocompletion IA sera indisponible jusqu\'a ce qu\'elle soit definie');
  }
  /* En production, un JWT_SECRET par defaut = tokens forgeables par n importe qui. */
  if (config.isProd && !config.jwtSecretProvided) {
    logger.alert('JWT_SECRET non defini : secret de dev par defaut actif (DANGER en production)');
  }
});

/* Collaboration temps reel : WebSocket monte sur le meme serveur HTTP (/ws),
   donc aucun port supplementaire ni configuration de proxy additionnelle. */
attachRealtime(server);

process.on('unhandledRejection', (reason) => {
  logger.error('Promesse rejetee non geree:', reason);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(`Le port ${config.port} est deja utilise. Arret.`);
  } else {
    logger.fatal('Erreur du serveur HTTP:', err.message);
  }
});

export default app;
