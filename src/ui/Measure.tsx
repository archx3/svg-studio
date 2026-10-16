import type { ReactNode } from 'react';
import { visualBounds, type ShapeInspect } from '../core/inspect';
import { fmt } from '../core/path';
import type { View } from '../state/gestures';

/** Labels in screen space: the angle of diagonal lines, along the line, and the size of the whole shape above its dashed box. */
export function Measure({ shapes, view, width, height, ns = '' }: { shapes: readonly ShapeInspect[]; view: View; width: number; height: number; ns?: string }) {
  const z = view.zoom;
  const P = (p: { x: number; y: number }) => ({ x: p.x * z + view.x, y: p.y * z + view.y });
  const out: ReactNode[] = [];
  for (const sh of shapes) {
    if (sh.hidden) continue;
    for (const sg of sh.segments) {
      if (sg.angle === null || !sg.d) continue;
      const a = P(sg.from);
      const b = P(sg.to);
      // Leave short segments alone: the label would be longer than the line.
      if (Math.hypot(b.x - a.x, b.y - a.y) < 46) continue;
      let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      else if (deg <= -90) deg += 180;
      out.push(
        <g key={`${sh.id}-${sg.index}`} transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${deg})`} className="angle-label" data-testid={`${ns}angle-label`}>
          <text dy="0.35em">{fmt(sg.angle, 2)}°</text>
        </g>,
      );
    }
  }
  const box = visualBounds(shapes);
  return (
    <svg className="overlay measure" width={width} height={height}>
      {box && (
        <>
          <rect className="shape-box" x={box.x * z + view.x} y={box.y * z + view.y} width={box.w * z} height={box.h * z} />
          <text className="shape-label" x={box.x * z + view.x} y={box.y * z + view.y - 7} data-testid={`${ns}shape-size`}>
            shape {fmt(box.w, 2)}x{fmt(box.h, 2)}
          </text>
        </>
      )}
      {out}
    </svg>
  );
}
