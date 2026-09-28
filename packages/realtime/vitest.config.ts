import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    environment: "node",
    include: ["packages/realtime/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "/tmp/relkit-realtime-vitest-coverage",
      include: ["packages/realtime/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts", "**/provider.ts", "**/types.ts"],
      thresholds: { lines: 99, branches: 94, functions: 100, statements: 99 },
    },
  },
});
