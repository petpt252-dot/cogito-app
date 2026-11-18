import { describe, expect, it } from 'vitest';
import { guardAgainstTranslators, speaksAppLanguage } from '../src/core/domGuard';

// A page translator moves text nodes into <font> elements; React's later removeChild/insertBefore must not throw.

class FakeNode {
  parentNode: unknown = null;
  kids: FakeNode[] = [];
  removeChild(child: FakeNode) {
    if (child.parentNode !== this) throw new Error('NotFoundError');
    this.kids = this.kids.filter((k) => k !== child);
    child.parentNode = null;
    return child;
  }
  insertBefore(node: FakeNode, ref: FakeNode | null) {
    if (ref && ref.parentNode !== this) throw new Error('NotFoundError');
    const i = ref ? this.kids.indexOf(ref) : this.kids.length;
    this.kids.splice(i, 0, node);
    node.parentNode = this;
    return node;
  }
}

describe('translator guard', () => {
  guardAgainstTranslators(FakeNode.prototype as never);
  const add = (parent: FakeNode) => parent.insertBefore(new FakeNode(), null);

  it('removing a text node a translator moved does not throw', () => {
    const button = new FakeNode();
    const text = add(button);
    const font = add(button);
    text.parentNode = font; // the translator moved it inside <font>
    expect(() => button.removeChild(text)).not.toThrow();
    expect(button.insertBefore(new FakeNode(), text)).toBeTruthy();
  });

  it('normal removes and inserts still work', () => {
    const parent = new FakeNode();
    const a = add(parent);
    const b = parent.insertBefore(new FakeNode(), a);
    expect(parent.kids).toEqual([b, a]);
    parent.removeChild(a);
    expect(parent.kids).toEqual([b]);
  });
});

describe('page translators', () => {
  it('are switched off for the languages the app has, and left on for the others', () => {
    for (const l of ['pt-BR', 'pt-PT', 'pt', 'en', 'en-GB']) expect(speaksAppLanguage([l, 'tr'])).toBe(true);
    for (const l of ['tr', 'fr-FR', 'es']) expect(speaksAppLanguage([l, 'en'])).toBe(false);
    expect(speaksAppLanguage([])).toBe(false);
  });
});
