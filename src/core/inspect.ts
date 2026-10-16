import { arcToCenter } from './arc';
import { type Pt, type Rect, distToSegmentSq, inflate, unionAll } from './geometry';
import { flattenSegs, parsePathCached, serializePath, type Seg } from './path';
import { geomBounds, geomToSegs } from './shapes';
import type { Doc, Geometry, Node, Style } from './types';

/* Taking shapes apart into the segments they are drawn with, so that the canvas and the source text can show
   the same colours for the same piece of the drawing. */

export interface DrawnSegment {
  /** Position among the shape's segments. */
  index: number;
  kind: 'line' | 'curve' | 'arc' | 'close';
  from: Pt;
  to: Pt;
  /** Path data for this segment alone (empty for a closepath that is already where it should end). */
  d: string;
  /** The segment flattened into short straight pieces, for hit-testing. */
  pts: Pt[];
  /**
   * Where it is written in a path's `d` attribute, as [start, end) offsets. A moveto is written as part of the
   * segment it starts, since it draws nothing by itself. Null for shapes that are not `<path>` elements.
   */
  span: [number, number] | null;
  /** For straight segments that are neither horizontal nor vertical: the acute angle with the horizontal, in degrees. */
  angle: number | null;
  /** For arcs: the whole ellipse the arc is a part of. */
  guide: { cx: number; cy: number; rx: number; ry: number; rot: number } | null;
}

const cache = new WeakMap<Geometry, DrawnSegment[]>();

/** The acute angle (degrees) between a direction and the horizontal; null for horizontal and vertical ones. */
export function acuteAngle(dx: number, dy: number): number | null {
  if (Math.hypot(dx, dy) < 1e-9) return null;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return deg < 0.005 || deg > 89.995 ? null : deg;
}

function compute(g: Geometry): DrawnSegment[] {
  const parsed = g.kind === 'path' ? parsePathCached(g.d) : null;
  const segs: readonly Seg[] = parsed ? parsed.segs : geomToSegs(g);
  const out: DrawnSegment[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = cur;
  let moveStart: number | null = null;
  segs.forEach((s, i) => {
    const own = parsed ? (parsed.spans[i] ?? null) : null;
    if (s.t === 'M') {
      cur = start = { x: s.x, y: s.y };
      moveStart = own ? own[0] : null;
      return;
    }
    const from = cur;
    const to: Pt = s.t === 'Z' ? start : { x: s.x, y: s.y };
    let kind: DrawnSegment['kind'] = 'curve';
    let guide: DrawnSegment['guide'] = null;
    if (s.t === 'L') kind = 'line';
    else if (s.t === 'Z') kind = 'close';
    else if (s.t === 'A') {
      kind = 'arc';
      const c = arcToCenter(from.x, from.y, s.rx, s.ry, s.rot, s.large, s.sweep, s.x, s.y);
      if (c) guide = { cx: c.cx, cy: c.cy, rx: c.rx, ry: c.ry, rot: s.rot };
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const straight = kind === 'line' || kind === 'close';
    const drawn = !(kind === 'close' && Math.hypot(dx, dy) < 1e-9);
    const piece: Seg = s.t === 'Z' ? { t: 'L', x: to.x, y: to.y } : s;
    const own2: Seg[] = [{ t: 'M', x: from.x, y: from.y }, piece];
    out.push({
      index: out.length,
      kind,
      from,
      to,
      d: drawn ? serializePath(own2) : '',
      pts: drawn ? (flattenSegs(own2)[0]?.pts ?? [from, to]) : [],
      span: own ? [moveStart ?? own[0], own[1]] : null,
      angle: straight ? acuteAngle(dx, dy) : null,
      guide,
    });
    moveStart = null;
    cur = to;
  });
  return out;
}

/** The segments a shape is drawn with, in drawing order. */
export function drawnSegments(g: Geometry): DrawnSegment[] {
  let out = cache.get(g);
  if (!out) {
    out = compute(g);
    cache.set(g, out);
  }
  return out;
}

export interface ShapeInspect {
  id: string;
  /** Position among all shapes of the document (hidden ones included), which is also the order they are written in. */
  elementIndex: number;
  geom: Geometry;
  segments: DrawnSegment[];
  /** A path with several segments gets a colour for each; anything else gets one for the whole element. */
  perSegment: boolean;
  /** The style the shape ends up with, groups included. */
  style: Style;
  /** Hidden itself or inside a hidden group. */
  hidden: boolean;
}

const modelCache = new WeakMap<Doc, ShapeInspect[]>();

/** Every shape of the document, in the order the source lists them. */
export function inspectShapes(doc: Doc): ShapeInspect[] {
  const hit = modelCache.get(doc);
  if (hit) return hit;
  const out: ShapeInspect[] = [];
  const go = (nodes: readonly Node[], inherited: Style, hidden: boolean) => {
    for (const n of nodes) {
      const here = { ...inherited, ...n.style };
      const h = hidden || !!n.hidden;
      if (n.type === 'group') go(n.children, here, h);
      else {
        const segments = drawnSegments(n.geom);
        out.push({ id: n.id, elementIndex: out.length, geom: n.geom, segments, perSegment: n.geom.kind === 'path' && segments.length > 1, style: here, hidden: h });
      }
    }
  };
  go(doc.children, doc.defaults, false);
  modelCache.set(doc, out);
  return out;
}

/* ---------------------------------------------------------------- colours */

const ELEMENT_COLORS = ['#3b9ae1', '#5b66d8', '#9a62d3', '#d2619f', '#25b9a5', '#8fc84a', '#ef6f4e', '#f2a23a'];

export const elementColor = (index: number): string => ELEMENT_COLORS[index % ELEMENT_COLORS.length]!;

/** Red through to green along the segments of one path. */
export function rampColor(k: number, count: number): string {
  const t = count <= 1 ? 0 : k / (count - 1);
  return `hsl(${Math.round(4 + t * 134)} 84% 57%)`;
}

/** The colour shared by a segment on the canvas and in the source. */
export const inspectColor = (shape: Pick<ShapeInspect, 'elementIndex' | 'perSegment' | 'segments'>, k: number): string =>
  shape.perSegment ? rampColor(k, shape.segments.length) : elementColor(shape.elementIndex);

/* ------------------------------------------------------------------ geometry */

export const strokeVisible = (s: Style): boolean => s.stroke !== undefined && s.stroke !== 'none' && s.stroke !== 'transparent' && (s.strokeWidth ?? 1) > 0;

/** The bounds of everything drawn, strokes included. */
export function visualBounds(shapes: readonly ShapeInspect[]): Rect | null {
  return unionAll(
    shapes
      .filter((s) => !s.hidden)
      .map((s) => {
        const b = geomBounds(s.geom);
        return b ? inflate(b, strokeVisible(s.style) ? (s.style.strokeWidth ?? 1) / 2 : 0) : null;
      }),
  );
}

/** The segment of a shape that is nearest to a point (null if it has none that is drawn). */
export function segmentAt(shape: Pick<ShapeInspect, 'segments'>, p: Pt): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const sg of shape.segments) {
    for (let i = 0; i + 1 < sg.pts.length; i++) {
      const d = distToSegmentSq(p, sg.pts[i]!, sg.pts[i + 1]!);
      if (d < bestD) {
        bestD = d;
        best = sg.index;
      }
    }
  }
  return best;
}
