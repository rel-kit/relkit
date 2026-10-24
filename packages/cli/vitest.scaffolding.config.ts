/** Runs CLI-owned scaffolding Effect and native-process cohorts under Bun; generic creation keeps its separate owning suite. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/cli/tests/scaffolding/**/*.effect.test.ts"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
