import { expect, type Page } from '@playwright/test';

/* The editor, driven the way a person would: mouse, keyboard and the panels. */

export const SUN = ['Path', 'Path', 'Path', 'Path', 'Path', 'Path', 'Path', 'Path', 'Circle'];

export interface Studio {
  page: Page;
  /** Screen position of a document coordinate (call refresh() after anything that moves the view). */
  at(u: number, v: number): { x: number; y: number };
  refresh(): Promise<void>;
  drag(from: [number, number], to: [number, number], mods?: string[]): Promise<void>;
  layers(): Promise<string[]>;
  selected(): Promise<string[]>;
  box(): Promise<{ x: number; y: number; w: number; h: number }>;
  tool(name: string): Promise<void>;
}

export async function open(page: Page, svg?: string): Promise<Studio> {
  await page.addInitScript(() => {
    // Start from the sample, once: a reload within the test keeps what the page saved.
    if (!sessionStorage.getItem('e2e-started')) {
      sessionStorage.setItem('e2e-started', '1');
      localStorage.removeItem('svg-studio:v1');
    }
  });
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  const studio = makeStudio(page);
  await expect(page.locator('.artboard')).toBeVisible();
  await studio.refresh();
  if (svg) {
    // Start from a blank canvas and paste the drawing in.
    await page.getByTestId('new').click();
    await pasteSvg(page, svg);
  }
  return studio;
}

export async function pasteSvg(page: Page, svg: string) {
  await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
  await page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, svg);
}

function makeStudio(page: Page): Studio {
  const artboard = async () => {
    const b = await page.locator('.artboard').boundingBox();
    if (!b) throw new Error('no artboard');
    return b;
  };
  let cached: { x: number; y: number; width: number; height: number } | null = null;
  const at = (u: number, v: number) => {
    if (!cached) throw new Error('call refresh() first');
    return { x: cached.x + (u * cached.width) / 24, y: cached.y + (v * cached.height) / 24 };
  };
  const studio: Studio = {
    page,
    at: (u, v) => at(u, v),
    async refresh() {
      cached = await artboard();
    },
    async drag(from, to, mods = []) {
      cached = await artboard();
      const a = at(...from);
      const b = at(...to);
      for (const m of mods) await page.keyboard.down(m);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.up();
      for (const m of mods) await page.keyboard.up(m);
    },
    layers: () => page.getByTestId('layer').locator('.layer-name').allTextContents(),
    selected: () => page.locator('[data-testid=layer].selected .layer-name').allTextContents(),
    async box() {
      const n = async (id: string) => Number(await page.getByTestId(id).inputValue());
      return { x: await n('pos-x'), y: await n('pos-y'), w: await n('size-w'), h: await n('size-h') };
    },
    async tool(name) {
      await page.getByTestId(`tool-${name}`).click();
    },
  };
  return studio;
}

export const near = (a: number, b: number, digits = 2) => expect(a).toBeCloseTo(b, digits);

/** Two rectangles and a circle, laid out so that marquees can enclose some and cross others. */
export const SHAPES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="6" height="6" />
  <rect x="14" y="3" width="7" height="6" />
  <circle cx="8" cy="17" r="4" />
  <path d="M15 14l6 6" />
</svg>`;

