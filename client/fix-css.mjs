/* Post-build : retire la declaration -webkit-text-size-adjust du preflight
   (warning Firefox connu de Tailwind 4, propriete sans effet sur desktop). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist', 'assets');
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.css')) continue;
  const p = path.join(dir, f);
  const css = fs.readFileSync(p, 'utf8');
  const next = css
    .replace(/-webkit-text-size-adjust:\s*100%;?/g, '')
    .replace(/-moz-text-size-adjust:\s*100%;?/g, '')
    .replace(/(?<![-a-z])text-size-adjust:\s*100%;?/g, '');
  if (next !== css) {
    fs.writeFileSync(p, next);
    console.log('[fix-css] declaration text-size-adjust retiree de ' + f);
  }
}
