import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/schema/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/schema/**/*.ts"],
      exclude: ["src/schema/**/*.types.ts", "src/schema/index.ts"],
      reporter: ["text-summary", "json"],
      reportsDirectory: "coverage/schema",
      thresholds: { statements: 97, branches: 88, functions: 100, lines: 98 },
    },
  },
});
