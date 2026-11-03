import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    // Projects mode resolves `include` from `dir`, not from `root`.
    dir: resolve(import.meta.dirname, "../.."),
    environment: "node",
    include: ["tests/inspector-api/**/*.test.ts"],
    // These run under `bun test`.
    exclude: [
      "tests/inspector-api/compatibility/**",
      "tests/inspector-api/*-bun.test.ts",
      "tests/inspector-api/jobs-administration.test.ts",
    ],
  },
});
