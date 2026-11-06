import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/diagnostics/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/diagnostics/**/*.ts"],
      exclude: ["src/diagnostics/**/*.types.ts", "src/diagnostics/**/index.ts"],
      reporter: ["text", "json"],
      reportsDirectory: "coverage/diagnostics",
      thresholds: { lines: 100, branches: 98, functions: 100, statements: 99 },
    },
  },
});
