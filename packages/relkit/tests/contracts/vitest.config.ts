import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/contracts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/contracts/**/*.ts"],
      exclude: ["src/contracts/**/*.types.ts", "src/contracts/index.ts", "src/contracts/jobs.ts"],
      reporter: ["text-summary", "json"],
      reportsDirectory: "coverage/contracts",
      thresholds: { statements: 99, branches: 99, functions: 100, lines: 99 },
    },
  },
});
