import { Cause, Effect } from "effect";
import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import {
  DoctorCommandError,
  formatDoctor,
  parseDoctorArgs,
  type DoctorOptions,
} from "./doctor-support.js";
import { doctorLiveLayer, doctorProjectEffect } from "./doctor-project.service.js";
export * from "./doctor-support.js";
export {
  CliDoctor,
  doctorLive,
  doctorLiveLayer,
  doctorProjectEffect,
} from "./doctor-project.service.js";

/**
 * Runs ordered prerequisites inside the provided doctor's lifetime.
 * @param args - Literal flags.
 * @param context - Existing result/error reporter.
 * @param options - Explicit native check policy.
 * @returns Lazy command status requiring CliDoctor; interruption remains interruption.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(runDoctorEffect(["--no-ports"], context).pipe(Effect.provide(doctorLiveLayer())));
 * ```
 */
export const runDoctorEffect = Effect.fn("Doctor.command")(
  function* (
    args: readonly string[],
    context: Pick<CliCommandContext, "json" | "reporter">,
    options: DoctorOptions = {},
  ) {
    const parsed = yield* Effect.try({
      try: () => parseDoctorArgs(args),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        error instanceof DoctorCommandError ? Effect.fail(error) : Effect.die(error),
      ),
    );
    const result = yield* doctorProjectEffect({ ...options, ...parsed });
    context.reporter.output(result, formatDoctor(result));
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  },
  (
    effect,
    _args: readonly string[],
    context: Pick<CliCommandContext, "json" | "reporter">,
    _options: DoctorOptions = {},
  ) =>
    observeCli("doctor.command", effect).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
        return Effect.sync(() => {
          const error = cliOriginalError(Cause.squash(cause));
          const code = error instanceof DoctorCommandError ? error.code : "RELKIT_DOCTOR_FAILED";
          context.reporter.error(code, error instanceof Error ? error.message : String(error));
          return code === "RELKIT_DOCTOR_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
        });
      }),
    ),
);

/**
 * Preserves the public Promise reporter and status contract.
 * @param args - Literal flags.
 * @param context - Existing reporter.
 * @param options - Native check overrides.
 * @returns Established exit status after finite check cleanup.
 */
export function runDoctor(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
  options: DoctorOptions = {},
): Promise<number> {
  return runCliEffect(runDoctorEffect(args, context, options), doctorLiveLayer(options));
}
