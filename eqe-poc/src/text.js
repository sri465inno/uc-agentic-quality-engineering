'use strict';
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'is', 'are', 'be', 'with', 'for', 'on', 'such', 'as', 'can', 'when', 'then', 'that', 'this', 'it', 'its', 'by', 'at', 'from', 'guest', 'user']);
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** Lower-case content words, hyphenated words split ("check-in" -> check, in), naive plural strip. */
const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map(stem);
const tokenSet = (s) => new Set(tokens(s));
/** Dice similarity of two texts' content-word sets. */
function dice(a, b) {
  const x = tokenSet(a); const y = tokenSet(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const t of x) if (y.has(t)) n += 1;
  return (2 * n) / (x.size + y.size);
}
/** True when every content word of the phrase occurs in the text. */
function containsPhrase(text, phrase) {
  const set = text instanceof Set ? text : tokenSet(text);
  const words = tokens(phrase);
  return words.length >= 2 && words.every((w) => set.has(w));
}
module.exports = { tokens, tokenSet, dice, containsPhrase };
