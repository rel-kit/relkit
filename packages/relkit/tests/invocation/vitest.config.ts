import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/invocation/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/invocation/**/*.ts"],
      exclude: ["src/invocation/**/*.types.ts", "src/invocation/**/index.ts"],
      reporter: ["text", "json"],
      reportsDirectory: "coverage/invocation",
      thresholds: { lines: 95, branches: 85, functions: 100, statements: 94 },
    },
  },
});
