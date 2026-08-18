import { describe, expect, test } from "bun:test";
import { assertFixtureGoldens, COMPILER_FIXTURES, compileFixture } from "./fixture-runner.ts";

describe.serial("compiler fixture goldens", () => {
  for (const name of COMPILER_FIXTURES) {
    test(name, async () => {
      const first = await compileFixture(name);
      const shuffled = await compileFixture(name, true);

      expect(first.temporaryRoot).not.toBe(shuffled.temporaryRoot);
      expect(shuffled.diagnosticsBytes).toBe(first.diagnosticsBytes);
      expect(shuffled.graphBytes).toBe(first.graphBytes);
      await assertFixtureGoldens(first);

      if (name.startsWith("warning-")) {
        expect(first.exitCode).toBe(0);
        expect(first.manifest).not.toBe("");
      }
      if (name.startsWith("error-")) {
        expect(first.exitCode).toBe(1);
        expect(first.manifest).toBe("");
        expect(shuffled.manifest).toBe("");
      }
    });
  }
});
