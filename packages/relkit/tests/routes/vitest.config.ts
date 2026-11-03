import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/routes/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/routes/**/*.ts"],
      exclude: [
        "src/routes/**/*.types.ts",
        "src/routes/index.ts",
        "src/routes/http-dsl-validation.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/routes",
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
