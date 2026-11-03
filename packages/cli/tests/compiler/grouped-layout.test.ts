/**
 * Executes paired compiler fixtures through native Bun child processes. Each probe
 * asserts logical identity, contracts and physical source provenance; the test owns
 * cancellation and awaits the child result without importing Bun-only fixture helpers.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execute = promisify(execFile);

describe("flat/grouped compiler compatibility", () => {
  for (const name of ["valid-minimal", "valid-full", "valid-inferred-identities"]) {
    it.live(`preserves ${name} identities, public contracts and real grouped sources`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise((signal) =>
          execute("bun", [resolve(import.meta.dirname, "grouped-layout.probe.ts"), name], {
            signal,
            maxBuffer: 1024 * 1024,
          }),
        );
        expect(result.stdout.trim()).toBe("layout probe passed");
        if (name === "valid-full") expect(result.stderr).toContain("scaffold.grouped.pulumi");
      }),
    );
  }
});
