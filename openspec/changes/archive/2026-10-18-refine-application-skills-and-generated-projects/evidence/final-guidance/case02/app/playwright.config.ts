import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: ".relkit/browser-test-results",
  use: {
    baseURL: process.env.FULLSTACK_BASE_URL ?? "http://127.0.0.1:3001",
    headless: true,
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "off",
  },
});
