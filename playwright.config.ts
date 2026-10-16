import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Use a preinstalled Chromium when one is available (e.g. in sandboxed environments).
const localChromium = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4175',
    viewport: { width: 1440, height: 900 },
    launchOptions: localChromium ? { executablePath: localChromium } : {},
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4175 --strictPort',
    port: 4175,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
