import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  root: repositoryRoot,
  test: {
    environment: "node",
    include: ["packages/graph/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/graph/src/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
      excludeAfterRemap: true,
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: resolve(repositoryRoot, "packages/graph/coverage"),
      thresholds: {
        lines: 100,
        branches: 93,
        functions: 100,
        statements: 97,
      },
    },
  },
});
