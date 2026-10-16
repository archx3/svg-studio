import { expect, test, type Page } from '@playwright/test';
import { near, open } from './helpers';

/* Colouring the segments of the drawing and finding them in the source, in both directions. */

const POINTER = 'M4.037 4.688a.495.495 0 01.651-.651l16 6.5a.5.5 0 01-.063.947l-6.124 1.58a2 2 0 00-1.438 1.435l-1.579 6.126a.5.5 0 01-.947.063z';
/** The icon in the editor this feature was modelled on: lines, a path of arcs and lines, and a rounded square. */
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

const area = (page: Page) => page.getByTestId('code-area');
const selectedText = (page: Page) => area(page).evaluate((t: HTMLTextAreaElement) => t.value.slice(t.selectionStart, t.selectionEnd));
const marks = (page: Page) => page.getByTestId('mark');

/** Where the text `needle` is on screen in the source editor (its second character, so a hover lands on it). */
async function textPosition(page: Page, needle: string) {
  return area(page).evaluate((t: HTMLTextAreaElement, n: string) => {
    const i = t.value.indexOf(n) + 1;
    const before = t.value.slice(0, i);
    const line = before.split('\n').length - 1;
    const col = i - (before.lastIndexOf('\n') + 1);
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    const charW = document.querySelector('.code-ruler')!.getBoundingClientRect().width / 10;
    const lh = parseFloat(cs.lineHeight);
    return { x: r.left + parseFloat(cs.paddingLeft) + col * charW - t.scrollLeft + charW / 2, y: r.top + parseFloat(cs.paddingTop) + line * lh - t.scrollTop + lh / 2 };
  }, needle);
}

async function withSegments(page: Page, svg = ICON) {
  const s = await open(page, svg);
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await expect(page.getByTestId('segment-layer')).toBeVisible();
  await expect(page.getByTestId('code-panel')).toBeVisible();
  await s.refresh();
  return s;
}

test.describe('segment colours', () => {
  test('are off until asked for, and turning them on opens the source', async ({ page }) => {
    await open(page, ICON);
    await expect(page.getByTestId('segment-layer')).toHaveCount(0);
    await expect(page.getByTestId('code-panel')).toHaveCount(0);
    await page.getByTestId('segments-view').click();
    await expect(page.getByTestId('segments-view')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('segment-layer')).toBeVisible();
    await expect(page.getByTestId('code-panel')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.getByTestId('segment-layer')).toHaveCount(0);
  });

  test('the text of every segment has the colour that segment is drawn in', async ({ page }) => {
    await withSegments(page);
    // Eight elements: seven paths (the pointer has eight segments) and a rectangle.
    await expect(marks(page)).toHaveCount(4 + 8 + 2 + 1);
    const pairs = await page.evaluate(() => {
      // (Computed colours, which the browser has put in its own form, so that a stroke and a background can be compared.)
      const segs = [...document.querySelectorAll('[data-testid=seg]')].map((e) => ({ id: e.getAttribute('data-id'), seg: e.getAttribute('data-seg'), color: e.getAttribute('data-color'), painted: getComputedStyle(e).stroke }));
      const mks = [...document.querySelectorAll('[data-testid=mark]')].map((e) => ({ id: e.getAttribute('data-id'), seg: e.getAttribute('data-seg'), color: e.getAttribute('data-color'), painted: getComputedStyle(e).backgroundColor, text: e.textContent }));
      return { segs, mks };
    });
    let matched = 0;
    for (const sg of pairs.segs) {
      const m = pairs.mks.find((x) => x.id === sg.id && x.seg === sg.seg);
      expect(m, `a mark for segment ${sg.seg} of ${sg.id}`).toBeTruthy();
      expect(m!.color).toBe(sg.color);
      // The colour is really what is painted, on the canvas and behind the text.
      expect(m!.painted).toBe(sg.painted);
      matched++;
    }
    expect(matched).toBeGreaterThanOrEqual(14);
    // The text of each segment of the pointer path, and a moveto goes with the segment it starts.
    const pointer = pairs.mks.filter((m) => m.id === pairs.mks[4 + 0]!.id).map((m) => m.text);
    expect(pointer.slice(0, 3)).toEqual(['M4.037 4.688a.495.495 0 01.651-.651', 'l16 6.5', 'a.5.5 0 01-.063.947']);
    // Different segments of one path have different colours, and so do different plain elements.
    expect(new Set(pairs.mks.slice(4, 12).map((m) => m.color)).size).toBe(8);
    expect(new Set(pairs.mks.slice(0, 4).map((m) => m.color)).size).toBe(4);
  });

  test('the source is drawn as the editor shows it, with the whole <rect> coloured and the <path d=" left plain', async ({ page }) => {
    await withSegments(page);
    const texts = await marks(page).allTextContents();
    expect(texts).toContain('<rect x="3" y="3" width="18" height="18" rx="2" />');
    expect(texts).toContain('M16 15v6');
    expect(texts.every((t) => !t.includes('<path'))).toBe(true);
    // The editor on top is transparent (the layer behind shows the colours) but still holds the text and the caret.
    expect(await area(page).evaluate((t) => getComputedStyle(t).color)).toBe('rgba(0, 0, 0, 0)');
    await expect(area(page)).toHaveValue(new RegExp(POINTER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('without the segments the source is plain, readable text', async ({ page }) => {
    await open(page, ICON);
    await page.getByTestId('toggle-code').click();
    expect(await area(page).evaluate((t) => getComputedStyle(t).color)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(marks(page)).toHaveCount(0);
  });

  test('hidden shapes are not coloured, and editing the source keeps the colours matched', async ({ page }) => {
    await withSegments(page);
    await expect(marks(page)).toHaveCount(15);
    // Type an edit: the colours follow the new text once it has been read.
    const text = await area(page).inputValue();
    await area(page).fill(text.replace('M16 15v6', 'M16 15v5'));
    await expect(marks(page).first()).toHaveText('M16 15v5');
    await expect(marks(page)).toHaveCount(15);
    const row = page.getByTestId('layer').first();
    await row.hover();
    const drawn = await page.getByTestId('seg').count();
    await row.getByRole('button', { name: 'Hide' }).click();
    await expect(marks(page)).toHaveCount(14);
    await expect(page.getByTestId('seg')).toHaveCount(drawn - 1);
  });

  test('the source scrolls to the coloured elements when the segments come on', async ({ page }) => {
    // A short panel, in which the first element (below the ten lines of the <svg> tag) is out of sight.
    await page.addInitScript(() => localStorage.setItem('svg-studio:code-height', '170'));
    await open(page, ICON);
    await page.getByTestId('toggle-code').click();
    expect(await area(page).evaluate((t) => t.scrollTop)).toBe(0);
    await page.keyboard.press('c');
    await expect.poll(() => area(page).evaluate((t) => t.scrollTop)).toBeGreaterThan(100);
    await expect(marks(page).first()).toBeInViewport();
  });

  test('the code panel can be resized, and remembers its height', async ({ page }) => {
    await open(page, ICON);
    await page.getByTestId('toggle-code').click();
    const panel = page.getByTestId('code-panel');
    const before = (await panel.boundingBox())!.height;
    const handle = (await page.getByTestId('code-resize').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 90, { steps: 6 });
    await page.mouse.up();
    near((await panel.boundingBox())!.height, before + 90, 0);
    expect(await page.evaluate(() => localStorage.getItem('svg-studio:code-height'))).toBe(String(Math.round(before + 90)));
    // The keyboard can do it too.
    await page.getByTestId('code-resize').focus();
    await page.keyboard.press('ArrowDown');
    near((await panel.boundingBox())!.height, before + 90 - 24, 0);
  });
});

test.describe('finding a segment', () => {
  test('clicking a segment on the canvas selects its text in the source', async ({ page }) => {
    const s = await withSegments(page);
    // The middle of the long diagonal line (l16 6.5).
    const p = s.at(12.69, 7.29);
    await page.mouse.click(p.x, p.y);
    expect(await selectedText(page)).toBe('l16 6.5');
    await expect(page.locator('.code-box.focus')).toHaveCount(1);
    await expect(page.getByTestId('seg-halo')).toHaveCount(1);
    await expect(page.getByTestId('seg-halo')).toHaveAttribute('data-seg', '1');
    // The editor is not given the keyboard, so the canvas shortcuts still work.
    expect(await area(page).evaluate((t) => document.activeElement === t)).toBe(false);
  });

  test('shift-click picks the whole element', async ({ page }) => {
    const s = await withSegments(page);
    const p = s.at(12.69, 7.29);
    await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.up('Shift');
    expect(await selectedText(page)).toBe(`<path d="${POINTER}" />`);
    // The whole path is ringed on the canvas: a halo for each of its drawn segments.
    expect(await page.getByTestId('seg-halo').count()).toBeGreaterThanOrEqual(7);
  });

  test('clicking a rectangle picks its whole tag', async ({ page }) => {
    const s = await withSegments(page);
    const p = s.at(3, 12.4); // the left side of the rounded square
    await page.mouse.click(p.x, p.y);
    expect(await selectedText(page)).toBe('<rect x="3" y="3" width="18" height="18" rx="2" />');
  });

  test('clicking different segments moves the selection in the source', async ({ page }) => {
    const s = await withSegments(page);
    let p = s.at(12.69, 7.29);
    await page.mouse.click(p.x, p.y);
    expect(await selectedText(page)).toBe('l16 6.5');
    // The yellow segment further down: l-6.124 1.58, from about (20.6, 11.5) back towards (14.5, 13.1).
    p = s.at(17.5, 12.3);
    await page.mouse.click(p.x, p.y);
    expect(await selectedText(page)).toBe('l-6.124 1.58');
  });

  test('putting the caret in a segment of the source picks it on the canvas', async ({ page }) => {
    await withSegments(page);
    await area(page).evaluate((t: HTMLTextAreaElement) => {
      t.focus();
      const i = t.value.indexOf('a2 2 0 00') + 3;
      t.setSelectionRange(i, i);
    });
    await expect(page.getByTestId('seg-halo')).toHaveAttribute('data-seg', '4');
    // The element is selected too, and the editor keeps the keyboard so typing carries on.
    await expect(page.getByTestId('layer').nth(3)).toHaveClass(/selected/);
    expect(await area(page).evaluate((t) => document.activeElement === t)).toBe(true);
    // Moving the caret on to another segment moves the halo with it.
    await area(page).evaluate((t: HTMLTextAreaElement) => {
      const i = t.value.indexOf('l-1.579 6.126') + 4;
      t.setSelectionRange(i, i);
    });
    await expect(page.getByTestId('seg-halo')).toHaveAttribute('data-seg', '5');
  });

  test('pointing at a segment on the canvas lights up its text, and the other way round', async ({ page }) => {
    const s = await withSegments(page);
    const p = s.at(12.69, 7.29);
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('.code-box.hover')).toHaveCount(1);
    await expect(page.getByTestId('seg-halo')).toHaveAttribute('data-seg', '1');
    // Away from every shape: nothing is lit.
    const away = s.at(12, 12);
    await page.mouse.move(away.x, away.y);
    await expect(page.locator('.code-box.hover')).toHaveCount(0);
    await expect(page.getByTestId('seg-halo')).toHaveCount(0);
    // Hovering the text of the yellow segment lights up that segment on the canvas.
    const t = await textPosition(page, 'l-6.124 1.58');
    await page.mouse.move(t.x, t.y);
    await expect(page.getByTestId('seg-halo')).toHaveAttribute('data-seg', '3');
    await expect(page.locator('.code-box.hover')).toHaveCount(1);
    // And hovering the rectangle's tag lights up the whole rounded square.
    const r = await textPosition(page, '<rect x="3"');
    await page.mouse.move(r.x, r.y);
    await expect(page.getByTestId('seg-halo').first()).toHaveAttribute('data-seg', '');
  });

  test('the selection survives a click on empty canvas only as long as the shape does', async ({ page }) => {
    const s = await withSegments(page);
    const p = s.at(12.69, 7.29);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('seg-halo')).toHaveCount(1);
    const away = s.at(12, 12);
    await page.mouse.click(away.x, away.y);
    await expect(page.getByTestId('seg-halo')).toHaveCount(0);
    await expect(page.locator('.code-box.focus')).toHaveCount(0);
  });
});

test.describe('segments on the canvas', () => {
  test('lines are white down the middle (dashed for diagonals), with rings at the ends and arcs showing their circle', async ({ page }) => {
    await withSegments(page);
    const info = await page.evaluate(() => {
      const layer = document.querySelector('[data-testid=segment-layer]')!;
      const dashed = [...layer.querySelectorAll('path')].filter((p) => p.getAttribute('stroke-dasharray')).length;
      return { dashed, rings: layer.querySelectorAll('circle[r]').length, ellipses: layer.querySelectorAll('ellipse').length };
    });
    // Three diagonal lines in the pointer path (plus its closing line).
    expect(info.dashed).toBeGreaterThanOrEqual(3);
    // Four corners of the square and four arcs of the pointer, each with a circle.
    expect(info.ellipses).toBe(8);
    expect(info.rings).toBeGreaterThan(20);
  });

  test('the artwork underneath is still the real thing: switching back shows the plain drawing', async ({ page }) => {
    await withSegments(page);
    await page.keyboard.press('c');
    await expect(page.getByTestId('segment-layer')).toHaveCount(0);
    await expect(page.locator('.art path')).toHaveCount(7);
    await expect(page.locator('.art rect')).toHaveCount(1);
  });
});

test.describe('measure', () => {
  test('shows the angle of every diagonal line, along the line', async ({ page }) => {
    await open(page, ICON);
    await page.keyboard.press('Escape');
    await page.keyboard.press('m');
    await expect(page.getByTestId('measure-view')).toHaveAttribute('aria-pressed', 'true');
    const labels = await page.getByTestId('angle-label').allTextContents();
    // The long line, the yellow one, and the two steep ones.
    expect(labels).toContain('22.11°');
    expect(labels).toContain('14.47°');
    expect(labels).toContain('75.55°');
    // Horizontal and vertical lines have none.
    expect(labels.every((l) => !['0°', '90°'].includes(l))).toBe(true);
    // The label is turned to lie along its line: a shallow diagonal is turned a little, not upside down.
    const rotations = await page.getByTestId('angle-label').evaluateAll((els) => els.map((e) => Number(/rotate\((-?[\d.]+)\)/.exec(e.getAttribute('transform')!)![1])));
    expect(rotations.every((r) => r > -90 && r <= 90)).toBe(true);
  });

  test('shows the size of the whole shape, strokes included, and follows what is drawn', async ({ page }) => {
    const s = await open(page, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l16 6.5"/></svg>`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('m');
    await expect(page.getByTestId('shape-size')).toHaveText('shape 18x8.5');
    expect(await page.getByTestId('angle-label').allTextContents()).toEqual(['22.11°']);
    // Stretch it and the label follows.
    await s.drag([2, 2], [20, 10.5]);
    await page.getByTestId('size-w').fill('30');
    await page.getByTestId('size-w').press('Enter');
    await expect(page.getByTestId('shape-size')).toHaveText(/^shape 32x/);
    // A hidden shape is not part of the drawing, so there is nothing to measure.
    await page.getByTestId('layer').first().hover();
    await page.getByTestId('layer').first().getByRole('button', { name: 'Hide' }).click();
    await expect(page.getByTestId('shape-size')).toHaveCount(0);
  });

  test('can be used together with the segments', async ({ page }) => {
    await withSegments(page);
    await page.keyboard.press('m');
    await expect(page.getByTestId('segment-layer')).toBeVisible();
    await expect(page.getByTestId('angle-label').first()).toBeVisible();
    await page.keyboard.press('m');
    await expect(page.getByTestId('angle-label')).toHaveCount(0);
  });
});

test.describe('tidy, and the code tab', () => {
  const VERBOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M 4.037 4.688 a 0.495 0.495 0 0 1 0.651 -0.651 l 16 6.5 z" stroke-linecap="round" stroke-width="2" opacity="1" />
  <g stroke="red"><path d="M4 10 H 20" stroke="red" fill="none"/></g>
  <g></g>
</svg>`;

  test('Tidy rewrites the source in its shortest form, and says so when there is nothing to do', async ({ page }) => {
    await open(page);
    await page.getByTestId('new').click();
    await page.getByTestId('toggle-code').click();
    await area(page).fill(VERBOSE);
    await expect(page.getByTestId('layer')).toHaveCount(3); // read, and now part of the drawing
    await page.getByTestId('tidy').click();
    await expect(page.getByTestId('toast')).toHaveText('Tidied');
    const tidy = await area(page).inputValue();
    expect(tidy).toContain('<path d="M4.037 4.688a.495.495 0 01.651-.651l16 6.5z" />');
    expect(tidy).toContain('<g stroke="red">\n    <path d="M4 10h16" />\n  </g>');
    expect(tidy).not.toContain('opacity');
    expect(tidy.match(/<g/g)).toHaveLength(1);
    // The drawing is what it was, and the change is one undo step.
    await expect(page.getByTestId('layer')).toHaveCount(3);
    await page.getByTestId('tidy').click();
    await expect(page.getByTestId('toast')).toHaveText('Already tidy');
    await page.getByTestId('undo').click();
    await expect(area(page)).toHaveValue(/M 4\.037 4\.688 a 0\.495/);
  });

  test('Tidy applies an edit that has not been read yet, and refuses text that is not SVG', async ({ page }) => {
    await open(page);
    await page.getByTestId('new').click();
    await page.getByTestId('toggle-code').click();
    await area(page).fill(VERBOSE);
    // Straight away, before the editor has had time to read what was typed.
    await page.getByTestId('tidy').click();
    await expect(page.getByTestId('layer')).toHaveCount(3);
    await area(page).fill('this is not svg');
    await page.getByTestId('tidy').click();
    await expect(page.getByTestId('code-panel')).toContainText('does not look like an SVG');
    await expect(page.getByTestId('layer')).toHaveCount(3);
  });

  test('the Code tab gives React, an icon node and a CSS data URI, to copy', async ({ page }) => {
    await open(page, ICON);
    await page.getByTestId('toggle-code').click();
    await page.getByTestId('tab-code').click();
    await expect(page.getByTestId('generated-code')).toContainText('export function');
    await page.getByTestId('copy-generated').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('strokeWidth="2"');
    await page.getByTestId('format-node').click();
    await expect(page.getByTestId('generated-code')).toContainText('["path", { d: "M16 15v6" }]');
    await page.getByTestId('format-uri').click();
    await expect(page.getByTestId('generated-code')).toContainText('background-image: url("data:image/svg+xml,');
    await page.getByTestId('tab-source').click();
    await expect(area(page)).toBeVisible();
  });
});
