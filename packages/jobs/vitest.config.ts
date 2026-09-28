import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "/tmp/relkit-jobs-package-coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/index.ts", "src/legacy.ts", "src/task-types.ts"],
      excludeAfterRemap: true,
      thresholds: {
        statements: 80,
        branches: 71,
        functions: 86,
        lines: 83,
      },
    },
  },
});
