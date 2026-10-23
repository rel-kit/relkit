/** Runs only integration-owned native suites with deterministic single-worker isolation. */
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../../.."),
  test: {
    include: ["integrations/packages/langchain/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["integrations/packages/langchain/src/**/*.ts"],
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
