/** Reuses the finite scaffold child owner while retaining expected launcher failures and both output streams. */
import { strict as assert } from "node:assert";
import { Duration, Effect } from "effect";
import { scaffoldChild } from "./scaffold-process.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";

/** Executes one package runner, joining its process and drains before observing its exact exit.
 * @param command - Executable, arguments, directory and environment.
 * @param expectedCode - Exit status the command must end with.
 * @param timeout - Deadline; creation with an install and `relkit check` need longer than the default.
 * @returns Both output streams.
 */
export function packedWrapperCommand(
  command: ScaffoldCommand,
  expectedCode = 0,
  timeout: Duration.Input = "2 minutes",
) {
  return Effect.gen(function* () {
    const owner = yield* scaffoldChild(command);
    const [exit, stdout, stderr] = yield* Effect.promise(() => owner.settled);
    if (
      exit.status !== "fulfilled" ||
      stdout.status !== "fulfilled" ||
      stderr.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: "wrapper.drain",
        message: "Launcher command exit and output did not settle",
      });
    assert.equal(
      exit.value,
      expectedCode,
      `${command.args.join(" ")}\n${stdout.value}${stderr.value}`,
    );
    return { stdout: stdout.value, stderr: stderr.value };
  }).pipe(Effect.scoped, Effect.timeout(timeout), Effect.withSpan("PackedWrapper.command"));
}
