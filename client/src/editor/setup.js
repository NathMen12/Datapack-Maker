import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  EditorView,
  keymap,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { mcCommands, mcSubCommands, mcSelectors, mcSelectorArgs } from './lang-mcfunction.js';

/* ============================================================
   Extensions de base de l'editeur mcfunction.
   - editorBase() : gouttiere, curseur, selection, keymaps
     (Enter saute des lignes, undo/redo Ctrl+Z/Y, historique)
   - staticCompletion() : autocompletion statique locale
   ============================================================ */

function toOptions(words, type, boost) {
  return words.map((w) => ({ label: w, type, boost, apply: w }));
}

const commandOptions = toOptions(mcCommands, 'keyword', 99);
const subOptions = toOptions(mcSubCommands, 'keyword', 90);
const selectorOptions = toOptions(mcSelectors, 'variable', 95);
const selectorArgOptions = toOptions(mcSelectorArgs, 'property', 80);

function currentWord(context) {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const word = (before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/) || [, ''])[1];
  return { before, word };
}

function mcCompletionSource(context) {
  const { before, word } = currentWord(context);
  if (!word) return null;

  /* Arguments de selecteur dans @a[...] */
  const selMatch = before.match(/@[aesrpn]\[([^\]]*)$/);
  if (selMatch) {
    const used = selMatch[1].split(',').map((s) => s.split('=')[0].trim()).filter(Boolean);
    return {
      from: context.pos - word.length,
      options: selectorArgOptions.filter((o) => !used.includes(o.label)),
      validFor: /^[a-z_]*$/,
    };
  }

  /* Debut de ligne : proposer toutes les commandes */
  if (/^\s*$/.test(before.trimEnd())) {
    return { from: context.pos - word.length, options: commandOptions, validFor: /^[a-z_]+$/ };
  }

  /* Sous-commandes + selecteurs en cours de ligne */
  return {
    from: context.pos - word.length,
    options: [...subOptions, ...selectorOptions, ...commandOptions],
    validFor: /^[a-z_]+$/,
  };
}

/* Base de l'editeur : gouttiere, curseur, selection, keymap complet. */
export function editorBase() {
  return [
    history(),
    closeBrackets(),
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    bracketMatching(),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, indentWithTab]),
  ];
}

export function staticCompletion() {
  return autocompletion({
    override: [mcCompletionSource],  icons: false,
    activateOnTyping: true,
    defaultKeymap: true,
  });
}

export { mcCompletionSource };
