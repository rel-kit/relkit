import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "/tmp/relkit-diagnostics-coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      thresholds: {
        lines: 100,
        branches: 98,
        functions: 100,
        statements: 99,
      },
    },
  },
});
