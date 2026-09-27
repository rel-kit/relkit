import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/index.ts", "src/guards.ts", "src/types.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
