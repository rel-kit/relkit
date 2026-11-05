/** Runs the AI SDK adapter's own suites. */
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: resolve(import.meta.dirname, "../../.."),
  test: { include: ["integrations/packages/ai-sdk/tests/**/*.test.ts"] },
});
