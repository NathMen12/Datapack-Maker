/* Couleurs Minecraft : noms legacy + correspondances hex pour l'apercu. */
export const MC_COLORS = [
  { name: 'black',       css: '#000000' },
  { name: 'dark_blue',   css: '#0000AA' },
  { name: 'dark_green',  css: '#00AA00' },
  { name: 'dark_aqua',   css: '#00AAAA' },
  { name: 'dark_red',    css: '#AA0000' },
  { name: 'dark_purple', css: '#AA00AA' },
  { name: 'gold',        css: '#FFAA00' },
  { name: 'gray',        css: '#AAAAAA' },
  { name: 'dark_gray',   css: '#555555' },
  { name: 'blue',        css: '#5555FF' },
  { name: 'green',       css: '#55FF55' },
  { name: 'aqua',        css: '#55FFFF' },
  { name: 'red',         css: '#FF5555' },
  { name: 'light_purple',css: '#FF55FF' },
  { name: 'yellow',      css: '#FFFF55' },
  { name: 'white',       css: '#FFFFFF' },
];

export function colorCss(name) {
  return MC_COLORS.find((c) => c.name === name)?.css || '#FFFFFF';
}

/* Construit un composant texte JSON Minecraft a partir d'un style. */
export function buildTextComponent({ text, color, bold, italic, underlined, obfuscated }) {
  const comp = { text: text || '' };
  if (color) comp.color = color;
  if (bold) comp.bold = true;
  if (italic) comp.italic = true;
  if (underlined) comp.underlined = true;
  if (obfuscated) comp.obfuscated = true;
  return comp;
}

/* Genere la commande complete : tellraw / title / etc. */
export function buildTextCommand(type, target, component) {
  const json = JSON.stringify(component);
  switch (type) {
    case 'tellraw': return `tellraw ${target || '@a'} ${json}`;
    case 'title': return `title ${target || '@a'} title ${json}`;
    case 'subtitle': return `title ${target || '@a'} subtitle ${json}`;
    case 'actionbar': return `title ${target || '@a'} actionbar ${json}`;
    case 'bossbar': return `bossbar set name ${target || 'dpm:bar'} name ${json}`;
    default: return json;
  }
}
