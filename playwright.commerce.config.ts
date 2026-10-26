/** Uses the same exact selected commerce origins as transport security, with
 * isolated cache/results and native graceful ownership of both servers.
 */
import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { playwrightSelection } from "./scripts/playwright-selection.js";
import { playwrightServerCommand } from "./scripts/playwright-server-command.js";

const selected = playwrightSelection("commerce");
const root = import.meta.dirname;

export default defineConfig({
  testDir: "./tests/e2e-commerce",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
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
        "tests/e2e/commerce-agent-server.ts",
      ]),
      env: { RELKIT_COMMERCE_FIXTURE_PORT: new URL(selected.backend).port },
      url: `${selected.backend}/_relkit/v1/client/identity`,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: playwrightServerCommand(selected.artifacts, "frontend", "node", [
        resolve(root, "examples/commerce-web/node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        new URL(selected.ui).port,
      ]),
      cwd: resolve(root, "examples/commerce-web"),
      env: {
        CI: "1",
        PORT: new URL(selected.ui).port,
        RELKIT_NEXT_DIST_DIR: selected.dist,
        NEXT_PUBLIC_RELKIT_BASE_URL: selected.backend,
        NODE_OPTIONS: "--max-old-space-size=1024",
        RAYON_NUM_THREADS: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      url: selected.ui,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
  ],
});
