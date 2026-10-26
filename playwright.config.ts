/** Runs Inspector UI assertions against one owned native Next/backend pair;
 * existing listeners are rejected and native teardown is graceful and bounded.
 */
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { playwrightSelection } from "./scripts/playwright-selection.js";
import { playwrightServerCommand } from "./scripts/playwright-server-command.js";

const selected = playwrightSelection("inspector");
const root = import.meta.dirname;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: selected.output,
  use: {
    baseURL: selected.ui,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: playwrightServerCommand(selected.artifacts, "backend", "bun", [
        "run",
        "tests/inspector/fixture-server.ts",
      ]),
      env: {
        RELKIT_FIXTURE_PORT: new URL(selected.backend).port,
        RELKIT_FIXTURE_PROJECT: resolve(selected.artifacts, "project"),
      },
      url: `${selected.backend}/_relkit/v1/health/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: playwrightServerCommand(selected.artifacts, "frontend", "node", [
        resolve(root, "apps/inspector/node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        new URL(selected.ui).port,
      ]),
      cwd: resolve(root, "apps/inspector"),
      env: {
        CI: "1",
        RELKIT_INSPECTOR_DIST_DIR: selected.dist,
        RELKIT_BACKEND_URL: selected.backend,
        RELKIT_INSPECTOR_API_TOKEN: randomBytes(32).toString("base64url"),
        NEXT_PUBLIC_RELKIT_BACKEND_URL: `${selected.ui}/_relkit/backend`,
        NEXT_PUBLIC_RELKIT_SOURCE_EDITOR: "vscode",
        NODE_OPTIONS: "--max-old-space-size=4096",
        RAYON_NUM_THREADS: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      // Compile the shared graph UI before starting interaction deadlines.
      url: `${selected.ui}/graph`,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
  ],
});
