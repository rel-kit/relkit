/**
 * Runs layout syntax/path acceptance under its real Bun host. The isolated child
 * retains native glob semantics and executes the assertion suite; the parent
 * owns cancellation and waits for the probe's physical completion.
 */
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execute = promisify(execFile);

describe("compiler layout discovery", () => {
  it.live(
    "passes helper, portable-path and structural acceptance under native Bun",
    () =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise((signal) =>
          execute("bun", [resolve(import.meta.dirname, "application-layout.probe.ts")], {
            signal,
            maxBuffer: 1024 * 1024,
          }),
        );
        expect(result.stdout.trim()).toBe("layout probe passed");
      }),
    30_000,
  );
});
