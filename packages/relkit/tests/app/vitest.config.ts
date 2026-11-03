import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/app/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/app/**/*.ts"],
      exclude: ["src/app/**/*.types.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage/app",
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
