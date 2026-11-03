import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/config/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/config/**/*.ts"],
      exclude: ["src/config/**/*.types.ts", "src/config/**/index.ts"],
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "coverage/config",
      thresholds: { lines: 99, branches: 98, functions: 100, statements: 99 },
    },
  },
});
