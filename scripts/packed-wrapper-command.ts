/** Reuses the finite scaffold child owner while retaining expected wrapper failures and both output streams. */
import { strict as assert } from "node:assert";
import { Effect } from "effect";
import { scaffoldChild } from "./scaffold-process.js";
import { ScaffoldProcessFailure } from "./scaffold-process.errors.js";
import type { ScaffoldCommand } from "./scaffold-process.types.js";

/** Executes one package runner, joining its process and drains before observing its exact exit. */
export const packedWrapperCommand = Effect.fn("PackedWrapper.command")(
  function* (command: ScaffoldCommand, expectedCode = 0) {
    const owner = yield* scaffoldChild(command);
    const [exit, stdout, stderr] = yield* Effect.promise(() => owner.settled);
    if (
      exit.status !== "fulfilled" ||
      stdout.status !== "fulfilled" ||
      stderr.status !== "fulfilled"
    )
      return yield* new ScaffoldProcessFailure({
        operation: "wrapper.drain",
        message: "Wrapper command exit and output did not settle",
      });
    assert.equal(
      exit.value,
      expectedCode,
      `${command.args.join(" ")}\n${stdout.value}${stderr.value}`,
    );
    return { stdout: stdout.value, stderr: stderr.value };
  },
  (effect) => effect.pipe(Effect.scoped, Effect.timeout("2 minutes")),
);
