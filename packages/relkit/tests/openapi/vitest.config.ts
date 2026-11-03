import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/openapi/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/openapi/**/*.ts"],
      exclude: ["src/openapi/**/*.types.ts", "src/openapi/**/index.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage/openapi",
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
