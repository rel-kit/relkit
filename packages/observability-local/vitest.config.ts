/** Runs native store suites in Node so addon loading and managed Node worker behavior use the intended runtime. */
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node", include: ["tests/**/*.test.ts"] } });
