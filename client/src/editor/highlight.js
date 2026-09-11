import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/* Palette mcfunction : mappee sur les classes CSS definies dans index.css */
export const mcHighlightStyle = HighlightStyle.define([
  { tag: t.comment, class: 'mc-comment' },
  { tag: t.keyword, class: 'mc-cmd' },
  { tag: t.className, class: 'mc-sub' },
  { tag: t.string, class: 'mc-string' },
  { tag: t.number, class: 'mc-number' },
  { tag: t.variableName, class: 'mc-selector' },
  { tag: t.atom, class: 'mc-bool' },
  { tag: t.propertyName, class: 'mc-nbtkey' },
  { tag: t.meta, class: 'mc-macro' },
]);

export function mcHighlight() {
  return syntaxHighlighting(mcHighlightStyle);
}
