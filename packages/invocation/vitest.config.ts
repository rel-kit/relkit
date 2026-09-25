import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
      reporter: ["text", "json"],
      reportsDirectory: "/tmp/relkit-invocation-coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      thresholds: {
        lines: 95,
        branches: 85,
        functions: 100,
        statements: 94,
      },
    },
  },
});
