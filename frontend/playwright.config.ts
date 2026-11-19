import { defineConfig } from '@playwright/test';

// The suite drives the real UI against the real API and a local Azure blob emulator.
// Start everything with ../scripts/e2e.sh (dev) or E2E_MODE=prod ../scripts/e2e.sh (built UI, cross-origin API).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // every test shares the single model blob
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'off',
    reducedMotion: 'reduce', // no animations to wait for while dragging or measuring
    // tall enough that the sticky feature list and the cards are on screen together while dragging
    viewport: { width: 1280, height: 1500 },
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
});
