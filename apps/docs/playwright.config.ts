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
    // The site builds as static files for Cloudflare; Blume's preview serves that build.
    command: "bun x blume preview --host=127.0.0.1 --port=3002",
    url: "http://127.0.0.1:3002/docs",
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
  },
});
