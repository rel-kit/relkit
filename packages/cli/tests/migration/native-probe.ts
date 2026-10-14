/** Executes migration acceptance with the same bounded, reaped native process authority as the CLI. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { CliProcess } from "../../src/services/process.service.js";

/**
 * Runs a finite Bun probe and joins its child/output before returning.
 * @param source - Native executable probe URL.
 * @returns Captured stdout with native failure and interruption preserved.
 */
export const nativeMigrationProbe = Effect.fn("test.migration.native")(function* (source: URL) {
  const result = yield* (yield* CliProcess)
    .run({
      command: "bun",
      args: [fileURLToPath(source)],
      cwd: process.cwd(),
      maximumOutputBytes: 262144,
    })
    .pipe(Effect.timeout("120 seconds"));
  assert.equal(result.exitCode, 0, result.stdout + result.stderr);
  return result.stdout;
});
