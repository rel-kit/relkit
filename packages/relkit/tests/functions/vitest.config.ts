import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/functions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/functions/**/*.ts"],
      exclude: [
        "src/functions/**/*.types.ts",
        "src/functions/types.ts",
        "src/functions/index.ts",
        "src/functions/descriptor-factory.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/functions",
      thresholds: { lines: 95, branches: 85, functions: 95, statements: 94 },
    },
  },
});
