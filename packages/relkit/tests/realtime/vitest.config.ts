import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/realtime/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/realtime/**/*.ts"],
      exclude: [
        "src/realtime/**/*.types.ts",
        "src/realtime/**/index.ts",
        "src/realtime/**/provider.ts",
        "src/realtime/**/types.ts",
      ],
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "coverage/realtime",
      thresholds: { lines: 99, branches: 94, functions: 100, statements: 99 },
    },
  },
});
