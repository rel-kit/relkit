import { Effect } from "effect";
import { cliPromise } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliProcess } from "../services/process.service.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import type { DoctorCommandRunner } from "./doctor.types.js";

/**
 * Executes a native check command or an injected runner under physical completion ownership.
 * @param command - Literal command vector.
 * @param cwd - Project working directory.
 * @param runner - Optional compatibility runner, which must settle after cancellation.
 * @returns A lazy exit status; interruption waits for the runner's physical settlement.
 */
export const doctorCommandEffect = Effect.fn("Doctor.command")(
  function* (command: readonly string[], cwd: string, runner?: DoctorCommandRunner) {
    if (runner !== undefined)
      return yield* doctorPromise("doctor.injectedCommand", (signal) =>
        runner(command, cwd, signal),
      );
    const process = yield* CliProcess;
    const result = yield* process.run({
      command: command[0]!,
      args: command.slice(1),
      cwd,
      maximumOutputBytes: 65_536,
    });
    return { exitCode: result.exitCode };
  },
  (effect) => observeCli("doctor.command", effect),
);

/**
 * Owns an injected native callback until its underlying Promise has settled.
 * @typeParam A - Callback success value.
 * @param operation - Fixed adapter label.
 * @param action - Native callback, consuming cancellation where supported.
 * @returns A scoped value; physical settlement precedes owner release.
 */
export function doctorPromise<A>(
  operation: string,
  action: (signal: AbortSignal) => PromiseLike<A>,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const owned = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController();
          const result = Promise.resolve().then(() => action(controller.signal));
          return {
            controller,
            result,
            settled: result.then(
              () => undefined,
              () => undefined,
            ),
          };
        }),
        (owned) =>
          Effect.gen(function* () {
            owned.controller.abort();
            yield* Effect.promise(() => owned.settled);
          }),
      );
      return yield* cliPromise(operation, () => owned.result);
    }),
  );
}

/**
 * Probes a finite native listener with acquisition before cleanup ownership.
 * @param port - Port to probe, including the dynamic zero value.
 * @returns Availability only after the acquired listener has physically stopped.
 */
export const availablePortEffect = Effect.fn("Doctor.port")(
  function* (port: number) {
    const cleanup = yield* CliCleanup;
    return yield* Effect.scoped(
      Effect.acquireRelease(
        Effect.try({
          try: () => Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() }),
          catch: () => false,
        }),
        (server) =>
          cleanupEffect(
            "doctor.port.release",
            cliPromise("doctor.port.close", async () => {
              await server.stop(true);
            }),
          ).pipe(Effect.provideService(CliCleanup, cleanup)),
      ).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      ),
    );
  },
  (effect) => observeCli("doctor.port", effect),
);
