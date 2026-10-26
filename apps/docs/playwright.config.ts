/** Exercises the built docs on an owned listener, independently of a contributor's preview. */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  outputDir: "./test-results",
  use: {
    baseURL: "http://127.0.0.1:3002",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node dist/server/entry.mjs",
    env: { HOST: "127.0.0.1", PORT: "3002" },
    url: "http://127.0.0.1:3002/docs",
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
  },
});
