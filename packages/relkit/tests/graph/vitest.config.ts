import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/graph/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/graph/**/*.ts"],
      exclude: ["src/graph/**/*.types.ts", "src/graph/**/index.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage/graph",
      thresholds: { lines: 100, branches: 93, functions: 100, statements: 97 },
    },
  },
});
