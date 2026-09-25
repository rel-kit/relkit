import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/local/index.ts",
        "src/model.ts",
        "src/telemetry.ts",
        "src/model-shared.ts",
        "src/**/*.types.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "/tmp/relkit-observability-vitest-coverage",
      thresholds: {
        statements: 86,
        branches: 77,
        functions: 87,
        lines: 89,
      },
    },
  },
});
