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
      reportsDirectory: "/tmp/relkit-buckets-coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      thresholds: { lines: 99, branches: 95, functions: 100, statements: 98 },
    },
  },
});
