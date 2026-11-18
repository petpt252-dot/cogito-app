// Page translators (Google Translate and the like) replace text nodes with <font> elements. React still holds the
// original nodes, so its next update throws from removeChild/insertBefore and the whole page goes blank. These
// guards make both calls tolerate a node that has been moved: the translated page keeps working.

interface NodeLike {
  parentNode: unknown;
  removeChild(child: never): unknown;
  insertBefore(node: never, ref: never): unknown;
}

export function guardAgainstTranslators(proto: NodeLike = Node.prototype as unknown as NodeLike) {
  const removeChild = proto.removeChild;
  const insertBefore = proto.insertBefore;
  proto.removeChild = function (this: NodeLike, child: never) {
    if ((child as NodeLike).parentNode !== this) return child;
    return removeChild.call(this, child);
  };
  proto.insertBefore = function (this: NodeLike, node: never, ref: never) {
    if (ref && (ref as NodeLike).parentNode !== this) return node;
    return insertBefore.call(this, node, ref);
  };
}

/** The app has its own English and Portuguese: browsers set to either have no need for a page translator. */
export const speaksAppLanguage = (languages: readonly string[]) => /^(en|pt)(-|$)/i.test(languages[0] ?? '');

/**
 * Ask page translators to leave the app alone. A translated text is a frozen copy the app can no longer update, so
 * counters and results would silently show old values (e.g. "0/30" while the progress bar shows 4 sessions).
 */
export function blockTranslation(doc: Document = document) {
  doc.documentElement.setAttribute('translate', 'no');
  doc.documentElement.classList.add('notranslate');
  const meta = doc.createElement('meta');
  meta.name = 'google';
  meta.content = 'notranslate';
  doc.head.appendChild(meta);
}
