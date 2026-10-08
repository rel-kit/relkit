import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/create-relkit/tests/**/*.effect.test.ts"],
    testTimeout: 15000,
    fileParallelism: false,
  },
});
