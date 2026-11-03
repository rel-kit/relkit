import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/buckets/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/buckets/**/*.ts"],
      exclude: ["src/buckets/**/*.types.ts", "src/buckets/**/index.ts"],
      reporter: ["text", "json"],
      reportsDirectory: "coverage/buckets",
      thresholds: { lines: 99, branches: 95, functions: 100, statements: 98 },
    },
  },
});
