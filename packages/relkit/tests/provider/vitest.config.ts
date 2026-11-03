import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/provider/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/provider/**/*.ts"],
      exclude: [
        "src/provider/**/*.types.ts",
        "src/provider/index.ts",
        "src/provider/protocol-builders.ts",
      ],
      reporter: ["text-summary", "json"],
      reportsDirectory: "coverage/provider",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
