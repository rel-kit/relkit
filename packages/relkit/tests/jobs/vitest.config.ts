import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/jobs/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/jobs/**/*.ts"],
      exclude: [
        "src/jobs/**/*.types.ts",
        "src/jobs/index.ts",
        "src/jobs/legacy.ts",
        "src/jobs/task-types.ts",
      ],
      excludeAfterRemap: true,
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "coverage/jobs",
      thresholds: { statements: 80, branches: 71, functions: 86, lines: 83 },
    },
  },
});
