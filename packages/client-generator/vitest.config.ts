import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: repositoryRoot,
  test: {
    environment: "node",
    include: ["packages/client-generator/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/client-generator/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: resolve(repositoryRoot, "packages/client-generator/coverage"),
      thresholds: {
        lines: 100,
        branches: 95,
        functions: 100,
        statements: 100,
      },
    },
  },
});
