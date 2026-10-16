# SVG Studio

An SVG icon editor that runs entirely in the browser. It follows the workflow of Lucide's icon editor (a 24 × 24 canvas with Lucide's keyline shapes, round-capped strokes, a layer list, live SVG code, a preview at real sizes) and adds what that editor lacks: **scale and rotate tools, groups you can transform as a unit, and drag-to-select.**

It is a static single-page app (React, TypeScript, Vite) with no backend and no runtime dependencies beyond React.

```sh
npm install
npm run dev          # dev server on http://localhost:5180
npm run build        # static build in dist/
npm run preview      # serve that build
npm run typecheck
npm test             # unit tests (tests/)
npm run test:e2e     # browser tests (e2e/; builds and serves the app itself)
```

## What you can do

**Draw.** Pen (click for corners, click-drag for curves, click the first point to close), line, rectangle, ellipse. Everything snaps to the grid (1, 0.5, 0.25 or 0.1 units); hold <kbd>Ctrl</kbd>/<kbd>⌘</kbd> to switch snapping off or on for one drag.

**Select.** Drag a rectangle on the canvas and everything it **completely encloses** is selected (*encompass* select). A shape the rectangle only crosses is left alone. The toggle at the bottom of the canvas (or holding <kbd>Alt</kbd> while dragging) switches to *touch* select, which also picks up what the rectangle merely crosses. The rectangle is solid for encompass and dashed green for touch, and the selection updates live as you drag. <kbd>Shift</kbd> adds to the selection.

**Transform.** Three ways, which all do the same thing:

| | Scale horizontally | Scale vertically | Scale both | Rotate |
| --- | --- | --- | --- | --- |
| Tool (drag on the canvas) | <kbd>X</kbd> | <kbd>Y</kbd> | <kbd>S</kbd> | <kbd>T</kbd> |
| Handles on the selection | side handles | top/bottom handles | corner handles | just outside a corner |
| Inspector → Transform | Horizontal + % | Vertical + % | Both + % | angle, ±45°, ±90°, 180° |

The tools scale and rotate about a **pivot**: the centre by default; drag the pivot marker (it jumps to the box's corners and edge midpoints) or pick one of the nine origins in the inspector. Dragging a handle, or the horizontal and vertical tools, past the pivot flips the selection. <kbd>Shift</kbd> keeps proportions (and, for the tools, makes *scale both* free; for rotation it snaps to 15°). <kbd>Alt</kbd> scales a handle about the centre. X, Y, W and H fields move and resize exactly; flip has its own buttons (<kbd>Shift</kbd>+<kbd>H</kbd> / <kbd>V</kbd>).

**Group.** <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>G</kbd> groups the selection, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroups. A group is selected, moved, scaled, rotated and flipped as one, and every path inside follows. Groups nest. Double-click (or <kbd>Enter</kbd>) opens a group to work on its members; <kbd>Esc</kbd> closes it. The layers panel shows the tree: drag a layer onto a group to move it in, or between rows to reorder.

**Edit points.** <kbd>A</kbd> (or double-click a shape) shows a path's points and Bézier handles. Drag them; double-click the path to add a point, double-click a point to switch it between corner and smooth; drag a rectangle to select several points; <kbd>Delete</kbd> removes them. Arcs stay arcs. Rectangles, circles and lines become paths on the first edit.

**See how a drawing is built.** Press <kbd>C</kbd> (or the segments button under the canvas) and every segment of every path is drawn in its own colour, and **the same colour is painted behind that segment's text in the source**, so you can see which part of `d="…"` draws which part of the icon. A path's segments run from red to green; other elements get one colour each, and a whole `<rect … />` is coloured as a tag. Each segment is drawn with its centre line (dashed along diagonals), rings at its ends, and, for arcs, the full circle they belong to with its centre marked. The matching works both ways:

- **Click a segment** on the canvas and its text is selected in the source (and scrolled into view). **Shift-click** picks the whole element.
- **Put the caret in a segment** of the source and it is ringed on the canvas, with its layer selected.
- **Hover** a segment on the canvas and its text lights up, and the other way round.

<kbd>M</kbd> (measure) adds the angle of every diagonal line, set along the line, and the size of the whole shape (strokes included) above its dashed box. The source panel has **Source** and **Code** tabs (the second gives the icon as a React component, a Lucide icon node or a CSS data URI to copy), a **Tidy** button, and a drag handle to make it taller. *Tidy* rewrites the source in its shortest form: path data in the compact style Lucide's own files use (`a.5.5 0 01-.063.947`), settings a layer repeats from what it inherits dropped, empty groups removed. It never changes how the icon looks.

**Style.** Stroke colour, width, ends and corners, fill and opacity, for the selection or (with nothing selected) for the whole icon, which is what Lucide icons do through attributes on the root `<svg>`. Layers can be hidden, locked and renamed.

**In and out.** Paste SVG (or path data) anywhere, drop an `.svg` file on the page, or use *Import*. The **Code** panel is editable and two-way. *Export* downloads SVG or PNG, or copies the SVG, a React component, or Lucide's `[tag, attributes]` icon node. Work is saved in this browser.

## Keyboard

Press <kbd>?</kbd> in the app for the full list.

| Keys | |
| --- | --- |
| <kbd>V</kbd> <kbd>A</kbd> <kbd>P</kbd> <kbd>L</kbd> <kbd>R</kbd> <kbd>E</kbd> | select, edit points, pen, line, rectangle, ellipse |
| <kbd>S</kbd> <kbd>X</kbd> <kbd>Y</kbd> <kbd>T</kbd> | scale both, scale horizontally, scale vertically, rotate |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Shift</kbd>+<kbd>G</kbd> | group / ungroup |
| <kbd>Alt</kbd> + drag | drag a copy (or, on empty canvas, touch-select) |
| <kbd>[</kbd> <kbd>]</kbd> (+ <kbd>Shift</kbd>) | back / forward (to the end) |
| arrows (+ <kbd>Shift</kbd>) | nudge by the snap step (0.1 with Shift) |
| <kbd>Space</kbd> + drag, <kbd>H</kbd> | pan; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + wheel, <kbd>+</kbd> <kbd>−</kbd> zoom; <kbd>Shift</kbd>+<kbd>1</kbd> fit |
| <kbd>C</kbd> | colour the segments and match them with the source |
| <kbd>M</kbd> | show angles and the size of the shape |
| <kbd>O</kbd> | outline view |

## How it works

- **Transforms are baked into the geometry.** Scaling or rotating a shape rewrites its coordinates instead of adding a `transform` attribute, so stroke widths stay what they were (an icon scaled up keeps its line weight; *Scale stroke width too* changes that), and the exported SVG is as clean as Lucide's own. A rectangle turned by a quarter stays a rectangle, a circle that is stretched becomes an ellipse, anything that cannot be described any other way becomes a path. Arcs are transformed exactly rather than approximated. `transform` attributes on imported SVG are baked in the same way.
- **Segments know where they are written.** The path parser records the text range of every segment (`parsePath(d).spans`), a scanner finds each shape's element in the SVG text, and the two are paired up by position, so a caret position, a canvas click and a colour all refer to the same segment. The pairing is dropped (and the source shown plain) while the text holds an edit that has not been read yet, so a colour never points at the wrong text.
- **Groups are containers.** A group has no transform of its own: transforming it transforms its members.
- **The model is immutable**, which makes undo cheap: every gesture previews live and then records a single undo step. Escape cancels a drag.

```
src/core/     pure TypeScript, no DOM: matrices, path parsing/serialising/transforms (arcs included),
              the point-level path model, shapes, the layer tree and group operations,
              hit-testing and encompass/touch selection, the transform maths, SVG import/export,
              the segments of a drawing and where each is written in the source (inspect, source), tidy
src/state/    the store with undo history, editing actions, pointer gestures, shortcuts
src/ui/       React: canvas, overlay, toolbar, layers, inspector, code panel, dialogs
tests/        unit tests of src/core (path/arc maths, groups, selection, transforms, SVG I/O)
e2e/          Playwright tests that drive the app with mouse and keyboard
```

## Limits

Shapes are paths, lines, rectangles, circles, ellipses, polylines and polygons, in groups. Text, images, gradients, `<use>`, masks and CSS in `<style>` are not supported; an import says what it left out. This is an independent implementation, built from Lucide's icon design guidelines and its editor's workflow; it shares no code with Lucide.
