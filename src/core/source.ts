import { inspectColor, elementColor, type ShapeInspect } from './inspect';

/* Finding the shapes in SVG source text, so that a position in the text can be tied to a segment of the drawing
   and the other way round. */

const GRAPHIC = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

export interface SourceElement {
  tag: string;
  /** [start, end) of the whole tag, from `<` to `>`. */
  start: number;
  end: number;
  /** Attribute values (without their quotes) as [start, end) offsets. */
  attrs: Map<string, [number, number]>;
}

const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';

/** The shape elements of SVG text, in order. Comments, closing tags and everything that isn't a shape are skipped. */
export function scanElements(text: string): SourceElement[] {
  const out: SourceElement[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) {
      const e = text.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    const next = text[lt + 1];
    if (next === '/' || next === '!' || next === '?' || !next || !/[A-Za-z]/.test(next)) {
      const e = text.indexOf('>', lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    let j = lt + 1;
    while (j < n && /[\w:.-]/.test(text[j]!)) j++;
    const tag = text.slice(lt + 1, j).toLowerCase();
    const attrs = new Map<string, [number, number]>();
    while (j < n) {
      while (j < n && isSpace(text[j])) j++;
      if (text[j] === '>') {
        j++;
        break;
      }
      if (text[j] === '/' && text[j + 1] === '>') {
        j += 2;
        break;
      }
      const ns = j;
      while (j < n && !isSpace(text[j]) && text[j] !== '=' && text[j] !== '>' && !(text[j] === '/' && text[j + 1] === '>')) j++;
      const name = text.slice(ns, j).toLowerCase();
      if (j === ns) {
        j++;
        continue;
      }
      while (j < n && isSpace(text[j])) j++;
      if (text[j] === '=') {
        j++;
        while (j < n && isSpace(text[j])) j++;
        const q = text[j];
        if (q === '"' || q === "'") {
          const vs = j + 1;
          const ve = text.indexOf(q, vs);
          attrs.set(name, [vs, ve < 0 ? n : ve]);
          j = ve < 0 ? n : ve + 1;
        } else {
          const vs = j;
          while (j < n && !isSpace(text[j]) && text[j] !== '>') j++;
          attrs.set(name, [vs, j]);
        }
      }
    }
    if (GRAPHIC.has(tag)) out.push({ tag, start: lt, end: j, attrs });
    i = j;
  }
  return out;
}

export interface SourceEntry {
  el: SourceElement;
  shape: ShapeInspect;
  /** Where the path data starts in the text, when this is a path whose text is exactly the document's path data. */
  dStart: number | null;
}

/**
 * Pairs each shape of the document with its element in the text. Returns null when the text no longer matches the
 * document (the number or kind of elements differ), as happens while the source holds an edit that is not applied yet.
 */
export function mapSource(text: string, shapes: readonly ShapeInspect[]): SourceEntry[] | null {
  const elements = scanElements(text);
  if (elements.length !== shapes.length) return null;
  const out: SourceEntry[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const el = elements[i]!;
    const shape = shapes[i]!;
    if (el.tag !== shape.geom.kind) return null;
    const dv = shape.geom.kind === 'path' ? el.attrs.get('d') : undefined;
    out.push({ el, shape, dStart: dv && shape.geom.kind === 'path' && text.slice(dv[0], dv[1]) === shape.geom.d ? dv[0] : null });
  }
  return out;
}

/** The text of a segment (or, with null, of the whole element). */
export function rangeFor(entry: SourceEntry, seg: number | null): [number, number] {
  if (seg !== null && entry.dStart !== null) {
    const span = entry.shape.segments[seg]?.span;
    if (span) return [entry.dStart + span[0], entry.dStart + span[1]];
  }
  return [entry.el.start, entry.el.end];
}

export interface Mark {
  start: number;
  end: number;
  id: string;
  /** The segment it belongs to (null: the whole element). */
  seg: number | null;
  color: string;
}

/** The pieces of the text to colour: each segment of a path's data, and each other element as a whole. Hidden shapes are left out. */
export function buildMarks(entries: readonly SourceEntry[]): Mark[] {
  const out: Mark[] = [];
  for (const e of entries) {
    const sh = e.shape;
    if (sh.hidden) continue;
    if (e.dStart !== null) {
      for (const sg of sh.segments) {
        if (sg.span) out.push({ start: e.dStart + sg.span[0], end: e.dStart + sg.span[1], id: sh.id, seg: sg.index, color: inspectColor(sh, sg.index) });
      }
    } else out.push({ start: e.el.start, end: e.el.end, id: sh.id, seg: null, color: elementColor(sh.elementIndex) });
  }
  return out;
}

/** The shape and segment a position in the text belongs to (null segment: somewhere else in the element's tag). */
export function pointAt(entries: readonly SourceEntry[], index: number): { id: string; seg: number | null } | null {
  for (const e of entries) {
    if (index < e.el.start || index > e.el.end) continue;
    const id = e.shape.id;
    const dv = e.el.attrs.get('d');
    if (e.dStart === null || !dv || index < e.dStart || index > e.dStart + (dv[1] - dv[0])) return { id, seg: null };
    const rel = index - e.dStart;
    const spans = e.shape.segments.filter((s) => s.span);
    // The segment the position is in; a position between two (or at the very end) belongs to the one before.
    const inside = spans.find((s) => rel >= s.span![0] && rel < s.span![1]) ?? spans.find((s) => rel === s.span![1]);
    if (inside) return { id, seg: inside.index };
    const before = [...spans].reverse().find((s) => s.span![1] <= rel);
    return { id, seg: before ? before.index : (spans[0]?.index ?? null) };
  }
  return null;
}
