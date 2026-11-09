import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/client-generator/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/client-generator/client-generator/**/*.ts"],
      exclude: ["src/client-generator/**/*.types.ts", "src/client-generator/**/index.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage/client-generator",
      thresholds: { lines: 100, branches: 95, functions: 100, statements: 100 },
    },
  },
});
