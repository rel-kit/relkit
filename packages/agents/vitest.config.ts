import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    include: ["packages/agents/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/agents/src/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 89,
        statements: 88,
      },
    },
  },
});
