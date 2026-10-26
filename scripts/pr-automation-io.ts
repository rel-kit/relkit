/** Adapts bounded Git/gh calls and finite data-file operations for PR preparation; commands never run PR scripts. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Data, Effect } from "effect";

const execute = promisify(execFile);

/** A preparation failure carries only its fixed stage and safe native diagnostic. */
export class PrPreparationError extends Data.TaggedError("PrPreparationError")<{
  /** Fixed operation label, without credentials or untrusted file contents. */
  readonly operation: string;
  /** Native diagnostic suitable for a private CI log. */
  readonly message: string;
}> {}

/**
 * Converts a finite external operation into a typed, observed Effect stage.
 * @typeParam A - Native success contract.
 * @param operation - Fixed stage name used in diagnostics.
 * @param run - Abort-aware operation; finite filesystem operations may ignore the signal.
 * @returns Lazy success or PrPreparationError; interruption aborts and joins native settlement and cleanup.
 */
export const prepareOperation = Effect.fn("PrPreparation.operation")(
  <A>(operation: string, run: (signal: AbortSignal) => Promise<A>) =>
    Effect.gen(function* () {
      const owner = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController();
          const promise = Promise.resolve().then(() => run(controller.signal));
          return { controller, promise };
        }),
        (owner) =>
          Effect.promise(async () => {
            owner.controller.abort();
            await owner.promise.then(
              () => undefined,
              () => undefined,
            );
          }),
      );
      return yield* Effect.tryPromise({
        try: () => owner.promise,
        catch: (cause) =>
          new PrPreparationError({
            operation,
            message: cause instanceof Error ? cause.message : "Preparation failed",
          }),
      });
    }).pipe(Effect.scoped),
);

/**
 * Runs a finite Git or gh data operation, with no shell interpolation.
 * @param command - Installed platform command.
 * @param args - Separate literal arguments, including validated identifiers.
 * @param cwd - Trusted repository checkout.
 * @param signal - Owning preparation cancellation.
 * @returns UTF-8 stdout after exit; rejects on timeout or unsuccessful exit.
 */
export async function automationCommand(
  command: "git" | "gh" | "unzip",
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
): Promise<string> {
  const { stdout } = await execute(command, args, {
    cwd,
    signal,
    timeout: 30_000,
    killSignal: "SIGKILL",
    maxBuffer: 20 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}
