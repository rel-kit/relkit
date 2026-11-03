import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    include: ["tests/local-service/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/local-service/**/*.ts"],
      exclude: ["src/local-service/**/*.types.ts", "src/local-service/index.ts"],
      reporter: ["text", "json"],
      reportsDirectory: "coverage/local-service",
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
