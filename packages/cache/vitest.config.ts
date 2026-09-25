import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    include: ["packages/cache/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["packages/cache/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "/tmp/relkit-cache-coverage",
      thresholds: { statements: 99, branches: 95, functions: 100, lines: 99 },
    },
  },
});
