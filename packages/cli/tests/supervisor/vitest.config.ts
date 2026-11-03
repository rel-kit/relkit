import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../.."),
  test: {
    environment: "node",
    include: ["tests/supervisor/**/*.test.ts"],
  },
});
