import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/observability/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/observability/**/*.ts"],
      exclude: [
        "src/observability/index.ts",
        "src/observability/local/index.ts",
        "src/observability/model.ts",
        "src/observability/telemetry.ts",
        "src/observability/model-shared.ts",
        "src/observability/**/*.types.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/observability",
      thresholds: { statements: 86, branches: 77, functions: 87, lines: 89 },
    },
  },
});
