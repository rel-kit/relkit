import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    include: ["tests/events/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/events/**/*.ts"],
      exclude: [
        "src/events/**/*.types.ts",
        "src/events/**/index.ts",
        "src/events/**/event-registry.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/events",
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
