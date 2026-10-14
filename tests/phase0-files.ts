/** Checks original implementation-size and current documentation contracts; native synchronous source reads remain finite read-only assertion edges. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { implementationSizeOffenders } from "../scripts/verify.js";
import { root, withFixture } from "./phase0-harness.js";
import {
  staleAdvice,
  currentTopology,
  readmeTopology,
  inspectorGuidance,
} from "./phase0-guidance.js";

describe.serial("Phase 0 guardrails", () => {
  test("reports implementation files over the 250-line limit", async () => {
    return withFixture(
      {
        "packages/app/src/too-long.ts": Array.from({ length: 251 }, () => "export {};\n").join(""),
      },
      async (fixture) => {
        expect(implementationSizeOffenders(fixture)).toEqual([
          "packages/app/src/too-long.ts (251 lines)",
        ]);
      },
    );
  });
  test("repository guidance has current commands and topology", () => {
    const guidance = readFileSync(join(root, "AGENTS.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const gettingStarted = readFileSync(join(root, "docs/getting-started.md"), "utf8");
    const konsistent = readFileSync(join(root, "konsistent.json"), "utf8");
    for (const stale of staleAdvice) {
      expect(guidance).not.toContain(stale);
      expect(readme).not.toContain(stale);
      expect(gettingStarted).not.toContain(stale);
    }
    for (const current of currentTopology) {
      expect(guidance).toContain(current);
    }
    expect(guidance).toContain("port `3001`");
    for (const current of readmeTopology) {
      expect(readme).toContain(current);
    }
    expect(konsistent).toContain("integrations/packages/{packageName}");
    expect(konsistent).toContain("integrations/catalog");
    for (const current of inspectorGuidance) {
      expect(readme).toContain(current);
      expect(gettingStarted).toContain(current);
    }
    expect(gettingStarted).toContain("Cloud and deployment default to `none`");
  });
});
