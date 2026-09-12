import { z } from 'zod';

/* ============================================================
   Validation des chemins de fichiers d'un projet.
   Autorise UNIQUEMENT des chemins relatifs internes au projet :
   pas de remontee, pas d'absolu, pas de separateur Windows.
   ============================================================ */

const MAX_FILE_CONTENT = 512 * 1024;      /* 512 Ko par fichier */
const MAX_FILES = 500;

export const filePath = z.string().min(1).max(255).superRefine((p, ctx) => {
  if (p.includes('..')) {
    ctx.addIssue({ code: 'custom', message: 'path_traversal' });
    return;
  }
  if (p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) {
    ctx.addIssue({ code: 'custom', message: 'absolute_path' });
    return;
  }
  if (p.includes('\\') || p.includes('//')) {
    ctx.addIssue({ code: 'custom', message: 'invalid_path' });
    return;
  }
  if (!/^[a-zA-Z0-9_\-./]+$/.test(p)) {
    ctx.addIssue({ code: 'custom', message: 'invalid_chars' });
  }
});

export const fileSchema = z.object({
  path: filePath,
  content: z.string().max(MAX_FILE_CONTENT),
});

export const filesArray = z.array(fileSchema).max(MAX_FILES);

/* Verifie qu une data URI est un vrai PNG (signature 89 50 4E 47). */
export function isValidPngDataUri(dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/png;base64,')) return false;
  const b64 = dataUri.slice('data:image/png;base64,'.length);
  if (b64.length === 0 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return false;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 512 * 1024) return false;
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
