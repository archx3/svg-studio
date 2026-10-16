import { parsePath, serializePath } from './path';
import { SPEC_STYLE, type Doc, type Node, type Style, type StyleKey } from './types';

/**
 * The document with its markup cleaned up, without changing how it looks: path data is rewritten in the
 * shortest form, settings a layer repeats from what it inherits are dropped, and empty groups are removed.
 */
export function tidyDoc(doc: Doc): Doc {
  const clean = (nodes: readonly Node[], inherited: Style): Node[] =>
    nodes.flatMap((n): Node[] => {
      const style: Style = { ...n.style };
      for (const k of Object.keys(style) as StyleKey[]) {
        const effective = inherited[k] ?? (SPEC_STYLE as Style)[k];
        if (style[k] === effective) delete style[k];
      }
      if (n.type === 'group') {
        const children = clean(n.children, { ...inherited, ...style });
        return children.length ? [{ ...n, style, children }] : [];
      }
      let geom = n.geom;
      if (geom.kind === 'path') {
        const r = parsePath(geom.d);
        if (!r.error && r.segs.length) geom = { kind: 'path', d: serializePath(r.segs) };
      }
      return [{ ...n, style, geom }];
    });
  return { ...doc, children: clean(doc.children, doc.defaults) };
}
