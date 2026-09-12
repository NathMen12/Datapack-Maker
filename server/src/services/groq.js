import Groq from 'groq-sdk';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

let client = null;

function getClient() {
  if (!config.groqApiKey) {
    const err = new Error('GROQ_API_KEY manquante dans server/.env');
    err.status = 503;
    throw err;
  }
  if (!client) client = new Groq({ apiKey: config.groqApiKey });
  return client;
}

const SYSTEM_PROMPT = [
  'Tu es un moteur d\'autocompletion de code pour Minecraft Java Edition datapacks (fichier .mcfunction, JSON Minecraft).',
  'On te donne le debut de la ligne en cours et le contexte du fichier.',
  'Reponds UNIQUEMENT avec la suite la plus probable du texte (completion inline), sans code markdown, sans backticks, sans explication.',
  'Ne repete jamais le texte deja fourni. Termine ta reponse a la fin d\'une commande ou d\'un argument logique.',
  'Reste court (une commande, rarement deux lignes).',
].join(' ');

const GROQ_TIMEOUT_MS = 20_000;

/* Abort apres 20 s : protege le serveur et le quota de l utilisateur. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

export async function completeMcfunction({ prefix, context, fileName }) {
  const groq = getClient();
  const userContent = `Fichier: ${fileName || 'function.mcfunction'}\n\nContexte du fichier (extrait):\n${(context || '').slice(-1500)}\n\nSuite a completer (le texte se termine exactement ici):\n${prefix}`;

  const params = {
    model: config.aiModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 128,
    reasoning_effort: 'low',
  };

  let completion;
  try {
    const res = await withTimeout(groq.chat.completions.create(params), GROQ_TIMEOUT_MS, "groq_timeout");
    completion = res.choices?.[0]?.message?.content || '';
    return { completion: completion.trim(), tokens: res.usage?.total_tokens || 0 };
  } catch (err) {
    // Certains modeles refusent reasoning_effort : nouvelle tentative sans ce parametre.
    if (err?.status === 400 && params.reasoning_effort) {
      logger.alert('Groq a refuse reasoning_effort, nouvelle tentative sans le parametre');
      delete params.reasoning_effort;
      const res = await withTimeout(groq.chat.completions.create(params), GROQ_TIMEOUT_MS, "groq_timeout");
      completion = res.choices?.[0]?.message?.content || '';
      return { completion: completion.trim(), tokens: res.usage?.total_tokens || 0 };
    }
    throw err;
  }
}
