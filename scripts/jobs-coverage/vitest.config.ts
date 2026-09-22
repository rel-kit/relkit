import { defineConfig } from "vitest/config";

const jobSources = [
  "packages/jobs/src/duration.ts",
  "packages/jobs/src/resolve-binding-support.ts",
  "packages/jobs/src/resolve-binding.ts",
  "packages/jobs/src/task-policy-validation.ts",
  "packages/jobs/src/trigger-validation.ts",
  "packages/client/src/jobs/controller-state.ts",
  "packages/client/src/jobs/controller-support.ts",
  "packages/client/src/jobs/controller.ts",
  "packages/client/src/jobs/watch-feed-loop.ts",
  "packages/client/src/jobs/watch-feed-polling.ts",
  "packages/client/src/jobs/watch-feed-support.ts",
  "packages/client/src/jobs/watch.ts",
];

export default defineConfig({
  resolve: {
    alias: { "bun:test": "vitest" },
  },
  test: {
    environment: "node",
    include: [
      "packages/jobs/**/*.test.ts",
      "packages/client/jobs-watch.test.ts",
      "packages/client/jobs-watch-quality.test.ts",
      "packages/client/pending.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "lcov"],
      reportsDirectory: "/tmp/relkit-jobs-vitest-coverage",
      include: jobSources,
      exclude: ["**/*.test.ts", "**/index.ts"],
      excludeAfterRemap: true,
      thresholds: {
        branches: 90,
      },
    },
  },
});
