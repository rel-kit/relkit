/** Preserves mixed Effect causes and redacts native adapter details at the migration result boundary. */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { CliAdapterError, CliFailureError } from "../../src/cli-errors.js";
import { reportMigrationFailure } from "../../src/commands/migrate-failure.js";
import type { CliCommandContext } from "../../src/main-support.js";

/**
 * Builds borrowed result sinks for pure presentation assertions.
 * @param output - Caller-owned serialized result buffer.
 * @returns The unchanged CLI command presentation contract.
 */
function context(output: string[]): CliCommandContext {
  return {
    command: "migrate",
    args: ["layout"],
    json: true,
    signal: new AbortController().signal,
    log: () => undefined,
    reporter: {
      output: (value) => {
        output.push(JSON.stringify(value));
      },
      error: () => undefined,
    },
  };
}

it.effect("does not recover a recognized failure mixed with a defect or interruption", () =>
  Effect.gen(function* () {
    const failure = new CliFailureError({
      code: "RELKIT_LAYOUT_CONFLICT",
      message: "owned conflict",
      exitCode: 1,
    });
    for (const sibling of [Cause.die(new Error("private defect")), Cause.interrupt()]) {
      const output: string[] = [];
      const cause = Cause.combine(Cause.fail(failure), sibling);
      const result = yield* Effect.exit(reportMigrationFailure(cause, context(output)));
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) expect(result.cause).toEqual(cause);
      expect(output).toEqual([]);
    }
  }),
);

it.effect("projects a native adapter failure without serializing its private cause", () =>
  Effect.gen(function* () {
    const output: string[] = [];
    const privateText = "synthetic credential that must stay private";
    const native = new CliAdapterError({
      operation: "test.native",
      message: privateText,
      cause: new Error(privateText),
    });
    expect(yield* reportMigrationFailure(Cause.fail(native), context(output))).toBe(1);
    expect(output).toHaveLength(1);
    expect(output.join("")).not.toContain(privateText);
    expect(JSON.parse(output[0] ?? "null")).toMatchObject({
      ok: false,
      status: "refused",
      verification: "not-run",
    });
  }),
);
