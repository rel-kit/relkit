import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.types.ts", "src/types.ts", "src/index.ts", "src/internal.ts"],
      thresholds: {
        lines: 95,
        branches: 85,
        functions: 95,
        statements: 94,
      },
    },
  },
});
