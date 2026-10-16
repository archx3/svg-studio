import { memo, type ReactNode } from 'react';
import { inspectColor, strokeVisible, type ShapeInspect } from '../core/inspect';
import type { SegRef } from '../state/store';
import { outlineD } from './Overlay';

interface Props {
  shapes: readonly ShapeInspect[];
  zoom: number;
  hover: SegRef | null;
  focus: SegRef | null;
}

const WHITE = { stroke: '#fff' } as const;

/** The segment number a path piece is tagged with (shapes other than paths are one element, with none). */
const segAttr = (sh: ShapeInspect, k: number): number | string => (sh.perSegment || sh.geom.kind === 'path' ? k : '');

/** Whether a segment is the one a reference points at (or is part of the element it points at). */
const pointedAt = (ref: SegRef | null, id: string, seg: number): boolean => !!ref && ref.id === id && (ref.seg === null || ref.seg === seg);

function ShapeSegments({ sh, zoom, hover, focus }: { sh: ShapeInspect; zoom: number; hover: SegRef | null; focus: SegRef | null }) {
  const stroked = strokeVisible(sh.style);
  const w = stroked ? (sh.style.strokeWidth ?? 1) : 1.5 / zoom;
  const cap = sh.style.strokeLinecap ?? 'butt';
  const join = sh.style.strokeLinejoin ?? 'miter';
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  const node = (p: { x: number; y: number }, key: string) => {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(<circle key={key} cx={p.x} cy={p.y} r={5 / zoom} fill="none" style={WHITE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />);
  };

  // A path with several segments is coloured piece by piece; any other shape is one colour, drawn as one outline.
  const pieces = sh.perSegment ? sh.segments.filter((sg) => sg.d).map((sg) => ({ d: sg.d, k: sg.index })) : [{ d: outlineD(sh.geom), k: 0 }];
  for (const piece of pieces) {
    const color = inspectColor(sh, piece.k);
    const hot = sh.perSegment ? pointedAt(hover, sh.id, piece.k) || pointedAt(focus, sh.id, piece.k) : pointedAt(hover, sh.id, 0) || pointedAt(focus, sh.id, 0);
    if (hot) {
      out.push(<path key={`h${piece.k}`} data-testid="seg-halo" data-id={sh.id} data-seg={segAttr(sh, piece.k)} d={piece.d} style={{ stroke: 'var(--ink)' }} strokeWidth={w + 5 / zoom} strokeLinecap={cap} strokeLinejoin={join} opacity={0.85} />);
    }
    out.push(
      <path
        key={`s${piece.k}`}
        data-testid="seg"
        data-id={sh.id}
        data-seg={segAttr(sh, piece.k)}
        data-color={color}
        d={piece.d}
        style={{ stroke: color }}
        strokeWidth={w}
        strokeLinecap={cap}
        strokeLinejoin={join}
        opacity={0.94}
      />,
    );
  }

  for (const sg of sh.segments) {
    if (sg.d) {
      // The centre line of the segment: dashed along diagonals, which also get an angle label.
      out.push(<path key={`c${sg.index}`} d={sg.d} style={WHITE} strokeWidth={1} strokeDasharray={sg.angle !== null ? '4 3' : undefined} vectorEffect="non-scaling-stroke" opacity={0.9} />);
    }
    if (sg.guide) {
      const g = sg.guide;
      out.push(
        <ellipse key={`g${sg.index}`} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} transform={g.rot ? `rotate(${g.rot} ${g.cx} ${g.cy})` : undefined} style={WHITE} strokeWidth={1} opacity={0.3} vectorEffect="non-scaling-stroke" />,
        <circle key={`gc${sg.index}`} cx={g.cx} cy={g.cy} r={2.5 / zoom} fill="#ff9f43" opacity={0.95} />,
      );
    }
    if (sg.index === 0 || sg.d) {
      node(sg.from, `n${sg.index}f`);
      node(sg.to, `n${sg.index}t`);
    }
  }
  return <g data-testid="shape-segments">{out}</g>;
}

/** The drawing taken apart: every segment in its own colour, with its centre line, its end points and, for arcs, the circle they come from. */
export const SegmentLayer = memo(function SegmentLayer({ shapes, zoom, hover, focus }: Props) {
  return (
    <g className="segments" fill="none" data-testid="segment-layer">
      {shapes
        .filter((s) => !s.hidden)
        .map((sh) => (
          <ShapeSegments key={sh.id} sh={sh} zoom={zoom} hover={hover} focus={focus} />
        ))}
    </g>
  );
});
