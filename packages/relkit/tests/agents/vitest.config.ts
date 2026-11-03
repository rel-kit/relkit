import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/agents/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/agents/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/agents",
      thresholds: { lines: 90, branches: 80, functions: 89, statements: 88 },
    },
  },
});
