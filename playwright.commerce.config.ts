import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-commerce",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "RELKIT_COMMERCE_FIXTURE_PORT=4010 bun run tests/e2e/commerce-agent-server.ts",
      url: "http://127.0.0.1:4010/_relkit/v1/client/identity",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command:
        "CI=1 PORT=3010 RELKIT_NEXT_DIST_DIR=.relkit/next-e2e NEXT_PUBLIC_RELKIT_BASE_URL=http://127.0.0.1:4010 bun --cwd examples/commerce-web dev",
      url: "http://127.0.0.1:3010",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
