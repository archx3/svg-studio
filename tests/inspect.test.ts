import { describe, expect, it } from 'vitest';
import { acuteAngle, drawnSegments, elementColor, inspectColor, inspectShapes, rampColor, segmentAt, visualBounds } from '../src/core/inspect';
import { buildMarks, mapSource, pointAt, rangeFor, scanElements } from '../src/core/source';
import { parseSvg, serializeSvg } from '../src/core/svg-io';
import { tidyDoc } from '../src/core/tidy';
import type { Doc } from '../src/core/types';

/** The icon in the editor screenshot: eight lines and a path made of arcs and lines, then a rounded square. */
const POINTER = 'M4.037 4.688a.495.495 0 01.651-.651l16 6.5a.5.5 0 01-.063.947l-6.124 1.58a2 2 0 00-1.438 1.435l-1.579 6.126a.5.5 0 01-.947.063z';
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16 15v6" />
  <path d="M16 3v6" />
  <path d="M3 15h18" />
  <path d="M3 9h18" />
  <path d="${POINTER}" />
  <path d="M8 15v6" />
  <path d="M8 3v6" />
  <rect x="3" y="3" width="18" height="18" rx="2" />
</svg>`;

const load = (svg = ICON): Doc => parseSvg(svg).doc;

describe('drawn segments', () => {
  const doc = load();
  const shapes = inspectShapes(doc);
  const pointer = shapes[4]!;

  it('lists every shape in the order the source writes them', () => {
    expect(shapes.map((s) => s.geom.kind)).toEqual(['path', 'path', 'path', 'path', 'path', 'path', 'path', 'rect']);
    expect(shapes.map((s) => s.elementIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('splits a path into the segments it is drawn with, a moveto joining the segment it starts', () => {
    const texts = pointer.segments.map((s) => POINTER.slice(s.span![0], s.span![1]));
    expect(texts).toEqual([
      'M4.037 4.688a.495.495 0 01.651-.651',
      'l16 6.5',
      'a.5.5 0 01-.063.947',
      'l-6.124 1.58',
      'a2 2 0 00-1.438 1.435',
      'l-1.579 6.126',
      'a.5.5 0 01-.947.063',
      'z',
    ]);
    expect(pointer.segments.map((s) => s.kind)).toEqual(['arc', 'line', 'arc', 'line', 'arc', 'line', 'arc', 'close']);
    expect(pointer.perSegment).toBe(true);
  });

  it('measures the angle of diagonal lines, as in the screenshot', () => {
    const angles = pointer.segments.map((s) => s.angle);
    expect(angles[1]).toBeCloseTo(22.11, 1);
    expect(angles[3]).toBeCloseTo(14.47, 1);
    expect(angles[5]).toBeCloseTo(75.54, 1);
    // Arcs have none, and neither do horizontal and vertical lines.
    expect(angles[0]).toBeNull();
    expect(shapes[0]!.segments[0]!.angle).toBeNull();
    expect(shapes[2]!.segments[0]!.angle).toBeNull();
  });

  it('knows the whole circle an arc belongs to', () => {
    const arc = pointer.segments[4]!;
    expect(arc.guide).toMatchObject({ rx: 2, ry: 2 });
    expect(pointer.segments[1]!.guide).toBeNull();
  });

  it('treats other shapes as one element drawn as a path of segments', () => {
    const rect = shapes[7]!;
    expect(rect.perSegment).toBe(false);
    expect(rect.segments.every((s) => s.span === null)).toBe(true);
    // Four straight sides and four rounded corners.
    expect(rect.segments.filter((s) => s.kind === 'arc')).toHaveLength(4);
    expect(rect.segments.filter((s) => s.kind === 'arc').every((s) => s.guide!.rx === 2)).toBe(true);
  });

  it('measures angles of diagonal edges of other shapes', () => {
    const tri = inspectShapes(load(`<svg viewBox="0 0 24 24"><polygon points="2,20 12,2 22,20"/></svg>`))[0]!;
    expect(tri.segments.map((s) => (s.angle === null ? null : s.angle.toFixed(1)))).toEqual(['60.9', '60.9', null]);
  });

  it('angles are acute and null for axis-aligned directions', () => {
    expect(acuteAngle(1, 0)).toBeNull();
    expect(acuteAngle(0, -3)).toBeNull();
    expect(acuteAngle(-1, 1)).toBeCloseTo(45);
    expect(acuteAngle(2, -1)).toBeCloseTo(26.565, 2);
    expect(acuteAngle(0, 0)).toBeNull();
  });

  it('finds the segment nearest to a point', () => {
    // Just beside the l16 6.5 line, near its middle.
    expect(segmentAt(pointer, { x: 12, y: 8.2 })).toBe(1);
    // Beside the arc at the start.
    expect(segmentAt(pointer, { x: 3.9, y: 4.6 })).toBe(0);
  });

  it('is cached per geometry', () => {
    expect(drawnSegments(pointer.geom)).toBe(drawnSegments(pointer.geom));
  });
});

describe('colours', () => {
  it('colours a path by segment, red through green, and everything else by element', () => {
    const shapes = inspectShapes(load());
    const pointer = shapes[4]!;
    expect(inspectColor(pointer, 0)).toBe(rampColor(0, 8));
    expect(inspectColor(pointer, 7)).toBe(rampColor(7, 8));
    expect(inspectColor(pointer, 0)).not.toBe(inspectColor(pointer, 7));
    expect(inspectColor(shapes[0]!, 0)).toBe(elementColor(0));
    expect(inspectColor(shapes[7]!, 3)).toBe(elementColor(7));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map(elementColor)).size).toBe(8);
  });
});

describe('visual bounds', () => {
  it('counts the stroke, and leaves out hidden shapes', () => {
    const doc = load(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l16 6.5"/></svg>`);
    expect(visualBounds(inspectShapes(doc))).toEqual({ x: 2, y: 2, w: 18, h: 8.5 });
    const hidden = { ...doc, children: doc.children.map((n) => ({ ...n, hidden: true })) } as Doc;
    expect(visualBounds(inspectShapes(hidden))).toBeNull();
  });
  it('inherits the stroke through groups, and ignores shapes with no stroke', () => {
    const doc = load(`<svg viewBox="0 0 24 24" fill="none" stroke="none"><g stroke="red" stroke-width="4"><path d="M5 5h10"/></g><circle cx="20" cy="20" r="1" fill="red"/></svg>`);
    expect(visualBounds(inspectShapes(doc))).toEqual({ x: 3, y: 3, w: 18, h: 18 });
  });
});

describe('scanning source text', () => {
  it('finds shape elements and the values of their attributes', () => {
    const text = `<svg><g><path d="M0 0h4" /><!-- <path d="no"> --><text>hi</text><circle cx=3 cy='3' r="1"></circle></g></svg>`;
    const els = scanElements(text);
    expect(els.map((e) => e.tag)).toEqual(['path', 'circle']);
    const d = els[0]!.attrs.get('d')!;
    expect(text.slice(d[0], d[1])).toBe('M0 0h4');
    expect(text.slice(els[0]!.start, els[0]!.end)).toBe('<path d="M0 0h4" />');
    const c = els[1]!;
    expect(text.slice(...c.attrs.get('cx')!)).toBe('3');
    expect(text.slice(...c.attrs.get('cy')!)).toBe('3');
    expect(text.slice(c.start, c.end)).toBe(`<circle cx=3 cy='3' r="1">`);
  });
  it('is not confused by a > inside an attribute value', () => {
    const text = `<svg><path data-x="a>b" d="M0 0l1 1"/><rect width="1" height="1"/></svg>`;
    const els = scanElements(text);
    expect(els.map((e) => e.tag)).toEqual(['path', 'rect']);
    expect(text.slice(...els[0]!.attrs.get('d')!)).toBe('M0 0l1 1');
  });
});

describe('source text and the drawing', () => {
  const doc = load();
  const text = serializeSvg(doc);
  const shapes = inspectShapes(doc);
  const entries = mapSource(text, shapes)!;

  it('pairs every shape with its element', () => {
    expect(entries).toHaveLength(8);
    expect(entries[4]!.dStart).not.toBeNull();
    expect(text.slice(entries[4]!.dStart!, entries[4]!.dStart! + POINTER.length)).toBe(POINTER);
  });

  it('colours the text of each path segment and each other element', () => {
    const marks = buildMarks(entries);
    const pointer = marks.filter((m) => m.id === shapes[4]!.id);
    expect(pointer.map((m) => text.slice(m.start, m.end))).toEqual([
      'M4.037 4.688a.495.495 0 01.651-.651',
      'l16 6.5',
      'a.5.5 0 01-.063.947',
      'l-6.124 1.58',
      'a2 2 0 00-1.438 1.435',
      'l-1.579 6.126',
      'a.5.5 0 01-.947.063',
      'z',
    ]);
    expect(pointer.map((m) => m.color)).toEqual(Array.from({ length: 8 }, (_, k) => rampColor(k, 8)));
    // The text colour is the colour the segment is drawn in.
    expect(pointer.map((m) => m.color)).toEqual(shapes[4]!.segments.map((s) => inspectColor(shapes[4]!, s.index)));
    // A plain line is one mark over its path data; the rectangle is one mark over its whole tag.
    const line = marks.filter((m) => m.id === shapes[0]!.id);
    expect(line.map((m) => text.slice(m.start, m.end))).toEqual(['M16 15v6']);
    const rect = marks.filter((m) => m.id === shapes[7]!.id);
    expect(rect.map((m) => text.slice(m.start, m.end))).toEqual(['<rect x="3" y="3" width="18" height="18" rx="2" />']);
    // Nothing overlaps.
    const sorted = [...marks].sort((a, b) => a.start - b.start);
    sorted.slice(1).forEach((m, i) => expect(m.start).toBeGreaterThanOrEqual(sorted[i]!.end));
  });

  it('finds the text of a segment, or of a whole element', () => {
    const [a, b] = rangeFor(entries[4]!, 1);
    expect(text.slice(a, b)).toBe('l16 6.5');
    const [c, d] = rangeFor(entries[4]!, null);
    expect(text.slice(c, d)).toBe(`<path d="${POINTER}" />`);
    const [e, f] = rangeFor(entries[7]!, 3);
    expect(text.slice(e, f)).toBe('<rect x="3" y="3" width="18" height="18" rx="2" />');
  });

  it('tells which segment a position in the text is in', () => {
    const [a, b] = rangeFor(entries[4]!, 3);
    expect(pointAt(entries, a)).toEqual({ id: shapes[4]!.id, seg: 3 });
    expect(pointAt(entries, Math.floor((a + b) / 2))).toEqual({ id: shapes[4]!.id, seg: 3 });
    // The end of the text of the last segment still belongs to it, and the tag outside the path data to the element.
    const [, z] = rangeFor(entries[4]!, 7);
    expect(pointAt(entries, z)).toEqual({ id: shapes[4]!.id, seg: 7 });
    expect(pointAt(entries, entries[4]!.el.start + 2)).toEqual({ id: shapes[4]!.id, seg: null });
    expect(pointAt(entries, entries[7]!.el.start + 8)).toEqual({ id: shapes[7]!.id, seg: null });
    expect(pointAt(entries, 3)).toBeNull();
  });

  it('gives up cleanly when the text no longer matches the drawing', () => {
    expect(mapSource(text.replace('<path d="M16 3v6" />', ''), shapes)).toBeNull();
    expect(mapSource(text.replace('<rect', '<circle'), shapes)).toBeNull();
    // Same elements, but the path data was edited: that element is coloured as a whole instead.
    const edited = mapSource(text.replace('M16 3v6', 'M16 3v7'), shapes)!;
    expect(edited[1]!.dStart).toBeNull();
    const marks = buildMarks(edited).filter((m) => m.id === shapes[1]!.id);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.seg).toBeNull();
  });

  it('works with the spaced writing of path data too', () => {
    const spaced = load(`<svg viewBox="0 0 24 24"><path d="M 4 4 L 20 4 L 20 20 Z"/></svg>`);
    const t = serializeSvg(spaced);
    const e = mapSource(t, inspectShapes(spaced))!;
    expect(buildMarks(e).map((m) => t.slice(m.start, m.end))).toEqual(['M 4 4 L 20 4', 'L 20 20', 'Z']);
  });
});

describe('tidy', () => {
  it('writes path data in the shortest form and drops settings that repeat what is inherited', () => {
    const doc = load(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 4.037 4.688 a 0.495 0.495 0 0 1 0.651 -0.651 L 20.037 11.188 Z" stroke-linecap="round" stroke-width="2" opacity="1" />
      <g stroke="red"><path d="M4 10 H 20" stroke="red" fill="none"/></g>
      <g></g>
    </svg>`);
    const out = tidyDoc(doc);
    const text = serializeSvg(out);
    expect(text).toContain('<path d="M4.037 4.688a.495.495 0 01.651-.651l15.349 7.151z" />');
    expect(text).toContain('<g stroke="red">\n    <path d="M4 10h16" />\n  </g>');
    expect(text.match(/<g/g)).toHaveLength(1);
    expect(text).not.toContain('opacity');
  });

  it('does not change what the icon looks like', () => {
    const doc = load(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><g stroke-width="3"><path d="M1 1h5" stroke-width="3"/><path d="M1 5h5" stroke-width="2"/></g></svg>`);
    const out = inspectShapes(tidyDoc(doc));
    expect(out.map((s) => s.style.strokeWidth)).toEqual([3, 2]);
  });

  it('leaves path data it cannot read alone', () => {
    const doc = load(`<svg viewBox="0 0 24 24"><path d="M0 0L5 5L oops"/></svg>`);
    expect((tidyDoc(doc).children[0] as { geom: { d: string } }).geom.d).toBe('M0 0L5 5L oops');
  });

  it('turns the editor-screenshot icon into exactly the tidy source shown there', () => {
    const verbose = ICON.replace(POINTER, 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z');
    expect(serializeSvg(tidyDoc(load(verbose)))).toContain(`<path d="${POINTER}" />`);
  });
});
