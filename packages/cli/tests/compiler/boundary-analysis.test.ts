/**
 * Executes native compiler dependency rejection cases in an isolated Bun process.
 * The parent owns cancellation; the probe validates real syntax/resolution behavior
 * and exits only after its finite assertions and cleanup settle.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execute = promisify(execFile);

describe("application dependency analysis", () => {
  it.live("enforces helper, re-export, type-only, dynamic and tooling boundaries", () =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise((signal) =>
        execute("bun", [resolve(import.meta.dirname, "boundary-analysis.probe.ts")], {
          signal,
          maxBuffer: 1024 * 1024,
        }),
      );
      expect(result.stdout.trim()).toBe("layout probe passed");
    }),
  );
});
