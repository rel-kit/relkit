import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://localhost:3211",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "RELKIT_FIXTURE_PORT=3212 bun run tests/inspector/fixture-server.ts",
      url: "http://127.0.0.1:3212/_relkit/v1/health/ready",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "CI=1 NEXT_PUBLIC_RELKIT_BACKEND_URL=http://127.0.0.1:3212 NEXT_PUBLIC_RELKIT_SOURCE_EDITOR=vscode bunx next dev apps/inspector -p 3211",
      url: "http://127.0.0.1:3211",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
