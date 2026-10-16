import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { reconcileIds } from '../core/doc';
import { inspectShapes } from '../core/inspect';
import { buildMarks, mapSource, pointAt, rangeFor, type SourceEntry } from '../core/source';
import { parseSvg, serializeSvg, SvgParseError } from '../core/svg-io';
import { tidyDoc } from '../core/tidy';
import type { Doc } from '../core/types';
import { hoverSegment, pickFromSource, toast } from '../state/actions';
import { store, useEditor, type SegRef } from '../state/store';
import { copyText, iconNodeForExport, jsxForExport, svgForExport } from './export';
import { Segmented } from './fields';
import { Icon } from './icons';
import { PreviewPane } from './PreviewPane';

type Tab = 'source' | 'code';
type Format = 'react' | 'node' | 'uri';

/** The lines (and the stretch of each) that a range of text covers. */
function lineBoxes(text: string, a: number, b: number): Array<{ line: number; col: number; len: number }> {
  const out: Array<{ line: number; col: number; len: number }> = [];
  const before = text.slice(0, a);
  let line = before.split('\n').length - 1;
  let lineStart = before.lastIndexOf('\n') + 1;
  let pos = a;
  while (pos < b) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl < 0 ? text.length : nl;
    const end = Math.min(b, lineEnd);
    out.push({ line, col: pos - lineStart, len: Math.max(1, end - pos) });
    pos = lineEnd + 1;
    lineStart = pos;
    line++;
  }
  return out;
}

interface SourceViewProps {
  text: string;
  onChange(value: string): void;
  /** The text matched to the drawing (null while the text doesn't match it, e.g. with an edit that has not been read yet). */
  entries: SourceEntry[] | null;
  hover: SegRef | null;
  focus: SegRef | null;
}

/**
 * The editable source. The text is drawn in a layer behind the (transparent) editor, which only keeps the caret and the
 * selection, so that the text of each segment can be given the colour that segment is drawn in.
 */
function SourceView({ text, onChange, entries, hover, focus }: SourceViewProps) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);

  const lineStarts = useMemo(() => {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
  }, [text]);

  const pieces = useMemo(() => {
    const marks = (entries ? buildMarks(entries) : []).sort((a, b) => a.start - b.start);
    const out: ReactNode[] = [];
    let at = 0;
    marks.forEach((m, i) => {
      if (m.start < at || m.end <= m.start) return;
      if (m.start > at) out.push(text.slice(at, m.start));
      out.push(
        <mark key={i} style={{ background: m.color }} data-testid="mark" data-id={m.id} data-seg={m.seg ?? ''} data-color={m.color}>
          {text.slice(m.start, m.end)}
        </mark>,
      );
      at = m.end;
    });
    // (the final newline keeps the layer exactly as tall as the editor's text)
    out.push(text.slice(at) + '\n');
    return out;
  }, [entries, text]);

  const rangeOf = (ref: SegRef | null): [number, number] | null => {
    if (!ref || !entries) return null;
    const e = entries.find((x) => x.shape.id === ref.id);
    return e ? rangeFor(e, ref.seg) : null;
  };
  const hoverRange = rangeOf(hover);
  const focusRange = rangeOf(focus);
  const boxes = [
    ...(hoverRange ? lineBoxes(text, ...hoverRange).map((b) => ({ ...b, kind: 'hover' })) : []),
    ...(focusRange ? lineBoxes(text, ...focusRange).map((b) => ({ ...b, kind: 'focus' })) : []),
  ];

  // The layer behind the editor scrolls with it.
  const sync = () => {
    const el = ta.current;
    const c = content.current;
    if (el && c) c.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
  };
  useLayoutEffect(sync, [text]);

  const charWidth = () => (ruler.current?.getBoundingClientRect().width ?? 0) / 10;

  /* Pointing at the text points at the segment on the canvas. */
  const onMove = (e: MouseEvent<HTMLTextAreaElement>) => {
    const el = ta.current;
    if (!entries || !el) return;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const charW = charWidth();
    if (!charW) return;
    const line = Math.floor((e.clientY - r.top - parseFloat(cs.paddingTop) + el.scrollTop) / parseFloat(cs.lineHeight));
    const col = Math.floor((e.clientX - r.left - parseFloat(cs.paddingLeft) + el.scrollLeft) / charW);
    if (line < 0 || line >= lineStarts.length || col < 0) return hoverSegment(null);
    const lineEnd = line + 1 < lineStarts.length ? lineStarts[line + 1]! - 1 : text.length;
    const index = lineStarts[line]! + col;
    hoverSegment(index < lineEnd ? pointAt(entries, index) : null);
  };

  /* Opening the source brings the first coloured element into view, so the colours are seen at once. */
  useEffect(() => {
    const el = ta.current;
    if (!el || !entries || document.activeElement === el) return;
    const first = entries.find((e) => !e.shape.hidden);
    if (!first) return;
    const lineH = parseFloat(getComputedStyle(el).lineHeight);
    const line = text.slice(0, first.el.start).split('\n').length - 1;
    el.scrollTop = Math.max(0, (line - 1) * lineH);
    el.scrollLeft = 0;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the source is opened
  }, []);

  /* Moving the caret into a segment picks it on the canvas. */
  useEffect(() => {
    if (!entries) return;
    const onSelection = () => {
      const el = ta.current;
      if (!el || document.activeElement !== el) return;
      const ref = pointAt(entries, el.selectionStart);
      if (ref) pickFromSource(ref);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [entries]);

  /* Picking a segment on the canvas selects its text and scrolls to it (without taking the keyboard away from the canvas). */
  useEffect(() => {
    const el = ta.current;
    if (!el || document.activeElement === el) return;
    const range = rangeOf(focus);
    if (!range) return;
    el.setSelectionRange(range[0], range[1]);
    const lineH = parseFloat(getComputedStyle(el).lineHeight);
    const before = text.slice(0, range[0]);
    const top = (before.split('\n').length - 1) * lineH;
    if (top < el.scrollTop || top + lineH > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    const left = (range[0] - (before.lastIndexOf('\n') + 1)) * charWidth();
    if (left < el.scrollLeft || left + 60 > el.scrollLeft + el.clientWidth) el.scrollLeft = Math.max(0, left - 60);
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the pick changes (or the text it points into does)
  }, [focus, entries]);

  return (
    <div className="code-wrap layered">
      <div className="code-under" aria-hidden="true">
        <div className="code-content" ref={content}>
          <pre className="code-pre">{pieces}</pre>
          {boxes.map((b, i) => (
            <div key={i} className={`code-box ${b.kind}`} style={{ top: `calc(var(--code-pad-y) + ${b.line} * var(--code-lh))`, left: `calc(var(--code-pad-x) + ${b.col}ch)`, width: `${b.len}ch` }} />
          ))}
        </div>
      </div>
      <span className="code-ruler" ref={ruler} aria-hidden="true">
        0000000000
      </span>
      <textarea
        ref={ta}
        className="code-area"
        aria-label="SVG source"
        data-testid="code-area"
        spellCheck={false}
        wrap="off"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onMouseMove={onMove}
        onMouseLeave={() => hoverSegment(null)}
      />
    </div>
  );
}

const dataUri = (doc: Doc) => `background-image: url("data:image/svg+xml,${encodeURIComponent(svgForExport(doc))}");`;

/** The icon as code to paste into a project. */
function GeneratedCode({ doc, name }: { doc: Doc; name: string }) {
  const [format, setFormat] = useState<Format>('react');
  const code = useMemo(() => (format === 'react' ? jsxForExport(doc, name) : format === 'node' ? iconNodeForExport(doc) : dataUri(doc)), [doc, name, format]);
  return (
    <div className="gen">
      <div className="gen-bar">
        <Segmented<Format>
          label="Code format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'react', label: 'React', title: 'A React component', testId: 'format-react' },
            { value: 'node', label: 'Icon node', title: "Lucide's [tag, attributes] icon node", testId: 'format-node' },
            { value: 'uri', label: 'CSS data URI', title: 'A CSS background image', testId: 'format-uri' },
          ]}
        />
        <span className="grow" />
        <button type="button" className="btn" data-testid="copy-generated" onClick={async () => toast((await copyText(code)) ? 'Copied' : 'Could not copy')}>
          <Icon name="copy" size={15} /> Copy
        </button>
      </div>
      <pre className="gen-code" data-testid="generated-code">
        {code}
      </pre>
    </div>
  );
}

/** The document as SVG source, editable: what you type is read back into the canvas as soon as it parses. */
export function CodePanel({ onClose }: { onClose(): void }) {
  const doc = useEditor((s) => s.doc);
  const name = useEditor((s) => s.name);
  const hover = useEditor((s) => s.hoverSeg);
  const focus = useEditor((s) => s.focus);
  const generated = useMemo(() => serializeSvg(doc, { includeHidden: true }), [doc]);
  const [tab, setTab] = useState<Tab>('source');
  const [text, setText] = useState(generated);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // The source the document currently corresponds to: what we show unless the user is typing something else.
  const synced = useRef(generated);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [height, setHeight] = useState(() => {
    try {
      return Number(localStorage.getItem('svg-studio:code-height')) || 340;
    } catch {
      return 340;
    }
  });
  const resize = (h: number) => {
    const next = Math.round(Math.min(Math.max(h, 140), Math.max(200, window.innerHeight * 0.75)));
    setHeight(next);
    try {
      localStorage.setItem('svg-studio:code-height', String(next));
    } catch {
      /* the size just isn't remembered */
    }
  };

  useEffect(() => {
    if (generated !== synced.current) {
      synced.current = generated;
      setText(generated);
      setError(null);
      setWarning(null);
    }
  }, [generated]);

  const shapes = useMemo(() => inspectShapes(doc), [doc]);
  const entries = useMemo(() => mapSource(text, shapes), [text, shapes]);

  const onChange = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const { doc: parsed, warnings } = parseSvg(value);
        const next = reconcileIds(store.get().doc, parsed);
        synced.current = serializeSvg(next, { includeHidden: true });
        setError(null);
        setWarning(warnings[0] ?? null);
        store.commit(next, {}, 'code');
      } catch (e) {
        setError(e instanceof SvgParseError ? e.message : 'Could not read this SVG');
      }
    }, 250);
  };

  /** Rewrites the source in its shortest form: compact path data, no repeated settings, no empty groups. */
  const tidy = () => {
    try {
      const { doc: parsed } = parseSvg(text);
      clearTimeout(timer.current);
      const current = store.get().doc;
      const next = tidyDoc(reconcileIds(current, parsed));
      const out = serializeSvg(next, { includeHidden: true });
      const changed = out !== text;
      synced.current = out;
      setText(out);
      setError(null);
      setWarning(null);
      if (out !== serializeSvg(current, { includeHidden: true })) store.commit(next);
      toast(changed ? 'Tidied' : 'Already tidy');
    } catch (e) {
      setError(e instanceof SvgParseError ? e.message : 'Could not read this SVG');
    }
  };

  return (
    <div className="code-panel" data-testid="code-panel" style={{ height }}>
      <div
        className="code-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the code panel"
        tabIndex={0}
        data-testid="code-resize"
        onPointerDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = height;
          const move = (m: PointerEvent) => resize(startH + (startY - m.clientY));
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            resize(height + (e.key === 'ArrowUp' ? 24 : -24));
          }
        }}
      />
      <div className="code-cols">
        <PreviewPane />
        <div className="code-right">
      <div className="code-head">
        <div className="tabs" role="tablist" aria-label="Code views">
          <button type="button" role="tab" aria-selected={tab === 'source'} className={`tab ${tab === 'source' ? 'on' : ''}`} data-testid="tab-source" onClick={() => setTab('source')}>
            Source
          </button>
          <button type="button" role="tab" aria-selected={tab === 'code'} className={`tab ${tab === 'code' ? 'on' : ''}`} data-testid="tab-code" onClick={() => setTab('code')}>
            Code
          </button>
        </div>
        {tab === 'source' &&
          (error ? (
            <span className="status error">{error}</span>
          ) : warning ? (
            <span className="status warn">{warning}</span>
          ) : (
            <span className="status ok">Colours match the segments in the preview</span>
          ))}
        <span className="grow" />
        {tab === 'source' && (
          <>
            <button type="button" className="btn" data-testid="tidy" onClick={tidy} title="Rewrite the source in its shortest form">
              <Icon name="wand" size={15} /> Tidy
            </button>
            <button type="button" className="btn" onClick={async () => toast((await copyText(svgForExport(doc))) ? 'SVG copied' : 'Could not copy')}>
              <Icon name="copy" size={15} /> Copy
            </button>
          </>
        )}
        <button type="button" className="btn icon" aria-label="Close code panel" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      {tab === 'source' ? <SourceView text={text} onChange={onChange} entries={entries} hover={hover} focus={focus} /> : <GeneratedCode doc={doc} name={name} />}
        </div>
      </div>
    </div>
  );
}
