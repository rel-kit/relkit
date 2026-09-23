import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/index.ts", "src/jobs.ts"],
      thresholds: {
        statements: 99,
        branches: 99,
        functions: 100,
        lines: 99,
      },
    },
  },
});
