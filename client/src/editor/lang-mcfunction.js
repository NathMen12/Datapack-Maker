import { StreamLanguage } from '@codemirror/language';

/* ============================================================
   Langage mcfunction pour CodeMirror 6 (StreamLanguage).
   Coloration : commandes, sous-commandes, selecteurs, NBT,
   chaines, nombres, commentaires, macros $(var).
   ============================================================ */

export const mcCommands = [
  'advancement', 'attribute', 'bossbar', 'clear', 'clone', 'damage', 'data', 'datapack', 'debug',
  'defaultgamemode', 'difficulty', 'effect', 'enchant', 'execute', 'experience', 'fill', 'forceload',
  'function', 'gamemode', 'gamerule', 'give', 'help', 'item', 'jfr', 'kill', 'list', 'locate',
  'loot', 'me', 'msg', 'particle', 'place', 'playsound', 'random', 'recipe', 'reload', 'return',
  'ride', 'rotate', 'say', 'schedule', 'scoreboard', 'seed', 'setblock', 'setworldspawn', 'spawnpoint',
  'spectate', 'spreadplayers', 'stopsound', 'summon', 'tag', 'team', 'teammsg', 'teleport', 'tell',
  'tellraw', 'tick', 'time', 'title', 'tm', 'tp', 'transfer', 'trigger', 'waypoint', 'w', 'whitelist', 'worldborder',
];

export const mcSubCommands = [
  'if', 'unless', 'run', 'as', 'at', 'in', 'on', 'positioned', 'rotated', 'align', 'anchored', 'facing', 'store',
  'append', 'prepend', 'insert', 'set', 'add', 'get', 'merge', 'remove', 'modify', 'entity', 'block', 'storage',
  'success', 'result', 'value', 'from', 'to', 'with', 'over', 'by', 'times', 'during', 'all', 'enabled', 'load', 'tick',
];

export const mcSelectors = ['@a', '@p', '@e', '@s', '@r', '@n', '@initiator'];

export const mcSelectorArgs = [
  'x', 'y', 'z', 'dx', 'dy', 'dz', 'distance', 'x_rotation', 'y_rotation', 'type', 'tag', 'team', 'name',
  'nbt', 'scores', 'advancements', 'gamemode', 'level', 'limit', 'sort', 'predicate', 'radius', 'rm',
];

export const mcKeyWords = [
  'true', 'false', 'run', 'all', 'none', 'nearest', 'furthest', 'random', 'arbitrary', 'spectator',
  'survival', 'creative', 'adventure', 'overworld', 'the_nether', 'the_end', 'minecraft', 'always', 'never',
];

const selRe = /@[aesrpn](\[.*)?$/;

function tokenOf(stream) {
  /* Commentaire */
  if (stream.eatWhile === undefined) return null;
  if (stream.peek() === '#') {
    stream.skipToEnd();
    return 'comment';
  }

  /* Macro $(var) */
  if (stream.peek() === '$') {
    stream.next();
    if (stream.match(/^\([a-zA-Z0-9_]+\)/)) return 'meta';
    return null;
  }

  /* Chaine JSON / NBT double quotes */
  if (stream.peek() === '"') {
    let escaped = false;
    stream.next();
    while (!stream.eol()) {
      const ch = stream.next();
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') break;
    }
    return 'string';
  }

  /* Cles NBT entre guillemets simples */
  if (stream.peek() === "'") {
    let escaped = false;
    stream.next();
    while (!stream.eol()) {
      const ch = stream.next();
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === "'") break;
    }
    return 'string';
  }

  /* NBT {cle:valeur} : on colore la cle en tant quepropertyName */
  if (stream.peek() === '{') {
    stream.next();
    return 'bracket';
  }

  /* Selecteur @a[...] */
  if (stream.peek() === '@') {
    stream.next();
    stream.eat(/[aesrpn]/);
    return 'variableName';
  }

  /* Nombre (avec .5, -1, 1.0d, 0b suffixes) */
  if (/[0-9]/.test(stream.peek())) {
    stream.eatWhile(/[0-9]/);
    if (stream.peek() === '.') { stream.next(); stream.eatWhile(/[0-9]/); }
    if (stream.eat(/[bdfL]/)) { /* suffixe */ }
    return 'number';
  }

  /* Identifiant : commande, sous-commande, mot-cle, chemin */
  if (/[a-zA-Z_]/.test(stream.peek())) {
    const word = stream.next();
    let acc = word;
    while (stream.peek() && /[a-zA-Z0-9_:.\/-]/.test(stream.peek())) acc += stream.next();

    /* Chemin de fonction minecraft:foo/bar ou resource location */
    if (acc.includes(':') || /\.(mcfunction)$/.test(acc)) return 'className';

    if (stream.string.slice(0, stream.start).trim() === '' && mcCommands.includes(acc)) return 'keyword';

    if (mcSubCommands.includes(acc)) return 'keyword';
    if (mcKeyWords.includes(acc)) return 'atom';
    if (selRe.test(stream.string.slice(0, stream.start) + acc)) return 'variableName';
    return null;
  }

  stream.next();
  return null;
}

export const mcfunction = () =>
  StreamLanguage.define({
    token: tokenOf,
  });

export default mcfunction;
