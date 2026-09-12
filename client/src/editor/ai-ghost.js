import { StateEffect, StateField, Facet, Prec } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view';

/* ============================================================
   Ghost text IA : suggestion inline en gris italique.
   - Tab accepte, Echap refuse, toute edition annule.
   ============================================================ */

export const setGhostText = StateEffect.define();

class GhostWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ai-ghost';
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return true; }
}

const ghostField = StateField.define({
  create() { return { text: '', pos: 0 }; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhostText)) return e.value;
    }
    if (tr.docChanged) return { text: '', pos: 0 };
    return value;
  },
});

function ghostDeco(state) {
  const field = state.field(ghostField, false);
  if (!field || !field.text || field.pos > state.doc.length) return Decoration.none;
  const { text, pos } = field;
  return Decoration.set([
    Decoration.widget({ widget: new GhostWidget(text), side: 1 }).range(pos),
  ]);
}

export const ghostDecoExtension = EditorView.decorations.of((view) => ghostDeco(view.state));

export function clearGhost(view) {
  view.dispatch({ effects: setGhostText.of({ text: '', pos: 0 }) });
}

export function acceptGhost(view) {
  const { text, pos } = view.state.field(ghostField);
  if (!text) return false;
  view.dispatch({
    changes: { from: pos, insert: text },
    selection: { anchor: pos + text.length },
    effects: setGhostText.of({ text: '', pos: 0 }),
  });
  view.focus();
  return true;
}

export const fileNameFacet = Facet.define({
  combine(values) { return values.length ? values[0] : 'function.mcfunction'; },
});

export function fileName(name) {
  return fileNameFacet.of(name);
}

/* Tab = accepter, Echap = refuser. Priorite maximale. */
export const aiGhostKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Tab',
      run: (view) => {
        const field = view.state.field(ghostField, false);
        if (field?.text) return acceptGhost(view);
        return false;
      },
    },
    {
      key: 'Escape',
      run: (view) => {
        const field = view.state.field(ghostField, false);
        if (field?.text) { clearGhost(view); return true; }
        return false;
      },
    },
  ])
);

/* Fabrique : ecoute les modifications, debounce, appel API, affiche le ghost. */
export function makeAIVoiceExtension({ fetchCompletion, getEnabled, getDelay, onQuota }) {
  let timer = null;
  let requestSeq = 0;

  async function request(view, seq) {
    const state = view.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const lineText = line.text.slice(0, pos - line.from);
    if (!lineText.trim()) return;
    const context = state.sliceDoc(Math.max(0, pos - 1500), pos);
    const name = state.facet(fileNameFacet);
    try {
      const { completion, percentUsed } = await fetchCompletion({ prefix: lineText, context, fileName: name });
      if (seq !== requestSeq) return;
      if (typeof percentUsed === 'number' && onQuota) onQuota(percentUsed);
      if (!completion) return;
      if (view.state.selection.main.head === pos) {
        view.dispatch({ effects: setGhostText.of({ text: completion, pos }) });
      }
    } catch {
      /* erreur reseau/quota : silencieux */
    }
  }

  return [
    ghostField, /* StateField OBLIGATOIRE : sinon "Field is not present in this state" */
    aiGhostKeymap,
    ghostDecoExtension,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const view = update.view;
      requestSeq += 1;
      const seq = requestSeq;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (getEnabled && !getEnabled()) return;
        request(view, seq);
      }, getDelay ? getDelay() : 700);
    }),
  ];
}
