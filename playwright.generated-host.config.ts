/** Runs the existing real-browser generated-host regression against its explicitly owned offline fixture. */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-commerce",
  testMatch: "generated-ai-regressions.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
