import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    environment: "node",
    include: ["packages/config/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "/tmp/relkit-config-vitest-coverage",
      include: ["packages/config/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      thresholds: { lines: 99, branches: 98, functions: 100, statements: 99 },
    },
  },
});
