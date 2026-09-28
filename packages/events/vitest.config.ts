import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    include: ["packages/events/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["packages/events/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts", "**/event-registry.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "/tmp/relkit-events-coverage",
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
