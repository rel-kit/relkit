import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/tools/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/tools/**/*.ts"],
      exclude: ["src/tools/**/*.types.ts", "src/tools/index.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/tools",
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
