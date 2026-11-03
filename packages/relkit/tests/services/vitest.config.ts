import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    include: ["tests/services/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/services/**/*.ts"],
      exclude: [
        "src/services/**/*.types.ts",
        "src/services/index.ts",
        "src/services/guards.ts",
        "src/services/types.ts",
      ],
      reporter: ["text", "json"],
      reportsDirectory: "coverage/services",
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
