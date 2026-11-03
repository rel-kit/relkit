import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    include: ["tests/cache/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/cache/**/*.ts"],
      exclude: ["src/cache/**/*.types.ts", "src/cache/**/index.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/cache",
      thresholds: { statements: 99, branches: 95, functions: 100, lines: 99 },
    },
  },
});
