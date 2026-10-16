import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { inspectShapes, segmentAt } from '../core/inspect';
import { hitTest } from '../core/pick';
import { focusSegment, hoverSegment, selectFromList } from '../state/actions';
import type { View } from '../state/gestures';
import { useEditor, type SegRef } from '../state/store';
import { Grid } from './Guides';
import { Icon } from './icons';
import { Measure } from './Measure';
import { SegmentLayer } from './SegmentLayer';

/**
 * The drawing taken apart, next to the source: every segment in the colour its text has, with centre lines, rings at
 * the ends, the circle of each arc, the angle of diagonal lines and the size of the shape. Pointing at a segment
 * lights up its text, and clicking selects it (Shift-click: the whole element).
 */
export function PreviewPane() {
  const doc = useEditor((s) => s.doc);
  const hover = useEditor((s) => s.hoverSeg);
  const focus = useEditor((s) => s.focus);
  const shapes = useMemo(() => inspectShapes(doc), [doc]);
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [labels, setLabels] = useState(true);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The drawing is fitted to the pane, with room around it for the labels.
  const pad = 30;
  const zoom = size.w > 0 ? Math.max(1, Math.min((size.w - pad * 2) / doc.width, (size.h - pad * 2) / doc.height)) : 1;
  const view: View = { zoom, x: (size.w - doc.width * zoom) / 2, y: (size.h - doc.height * zoom) / 2 };

  const pick = (e: PointerEvent<HTMLDivElement>): SegRef | null => {
    const r = stage.current!.getBoundingClientRect();
    const p = { x: (e.clientX - r.left - view.x) / zoom, y: (e.clientY - r.top - view.y) / zoom };
    const id = hitTest(doc, p, null, 7 / zoom, true);
    const sh = id ? shapes.find((x) => x.id === id) : undefined;
    return sh ? { id: sh.id, seg: sh.geom.kind === 'path' ? segmentAt(sh, p) : null } : null;
  };

  return (
    <div className="inspect-pane" data-testid="inspect-pane">
      <div className="inspect-head">
        <h3>Preview</h3>
        <span className="grow" />
        <button type="button" className={`btn icon ${labels ? 'on' : ''}`} aria-pressed={labels} title="Angles and size" aria-label="Angles and size" data-testid="preview-labels" onClick={() => setLabels((v) => !v)}>
          <Icon name="measure" />
        </button>
      </div>
      <div
        className="inspect-stage"
        ref={stage}
        data-testid="inspect-stage"
        onPointerMove={(e) => hoverSegment(pick(e))}
        onPointerLeave={() => hoverSegment(null)}
        onPointerDown={(e) => {
          const ref = pick(e);
          if (!ref) return focusSegment(null);
          selectFromList(ref.id);
          focusSegment(e.shiftKey ? { id: ref.id, seg: null } : ref);
        }}
      >
        <svg className="inspect-scene" width={size.w} height={size.h}>
          <g transform={`translate(${view.x} ${view.y}) scale(${zoom})`}>
            <rect className="inspect-artboard" x={0} y={0} width={doc.width} height={doc.height} />
            <Grid width={doc.width} height={doc.height} zoom={zoom} />
            <SegmentLayer shapes={shapes} zoom={zoom} hover={hover} focus={focus} ns="preview-" />
          </g>
        </svg>
        {labels && <Measure shapes={shapes} view={view} width={size.w} height={size.h} ns="preview-" />}
      </div>
      <p className="inspect-tip">Tip: Shift-click to select the full element.</p>
    </div>
  );
}
