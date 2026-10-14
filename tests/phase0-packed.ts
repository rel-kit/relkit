/** Runs the complete native external export/integration matrix with bounded nine-minute child work and ten-minute setup/cleanup harness allowance. */
import { describe, expect, test } from "bun:test";
import { execute, root } from "./phase0-harness.js";

describe.serial("Phase 0 guardrails", () => {
  test(
    "package exports resolve only through the public entry",
    async () => {
      const result = await execute(
        process.execPath,
        ["run", "scripts/pack-and-smoke-exports.ts"],
        root,
        540_000,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("12 packages loaded without unrelated integrations or SDKs");
      expect(result.stdout).toContain("packed entries resolved; internal paths rejected");
    },
    { timeout: 600_000 },
  );
});
