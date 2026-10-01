import { observeCompiler } from "../observability.js";
import { serializeJsonEffect } from "@relkit/contracts";
import { Effect, Fiber, Option, Schema, Stream } from "effect";
import type { EvaluatorRequest } from "./evaluator-protocol.types.js";
import type {
  EvaluatorProcess,
  SpawnEvaluator,
  EvaluatorProcessResult as ProcessResult,
} from "./evaluator-process.types.js";
import { allowlistedEnvironmentEffect } from "./evaluator-request.js";

export type { EvaluatorProcess, SpawnEvaluator } from "./evaluator-process.types.js";

/** Completed process status; output remains available after a deadline kills the child. */
export const EvaluatorProcessResult = Schema.Struct({
  exitCode: Schema.Number,
  timedOut: Schema.Boolean,
  stdout: Schema.String,
  stderr: Schema.String,
});

/** Native transport failure with its original cause and failing operation. */
export class EvaluatorProcessError extends Schema.TaggedError<EvaluatorProcessError>()(
  "EvaluatorProcessError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Runs one evaluator child with scoped readers, input deadline, and guaranteed reaping.
 * @param request - Validated evaluator request.
 * @param childPath - Absolute Bun evaluator entrypoint.
 * @param spawn - Optional native process factory used by transport tests.
 * @returns A lazy effect yielding reaped status/output or EvaluatorProcessError.
 * @remarks Interruption cancels readers before killing/reaping the child. Reads are supervised
 * concurrently so an early pipe failure cannot be hidden behind a pending exit.
 */
export const runEvaluatorProcess = Effect.fn("Discovery.runEvaluatorProcess")(
  function* (request: EvaluatorRequest, childPath: string, spawn?: SpawnEvaluator) {
    const environment = yield* allowlistedEnvironmentEffect(request.environmentAllowlist).pipe(
      Effect.mapError((cause) => new EvaluatorProcessError({ operation: "environment", cause })),
    );
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const child = yield* Effect.acquireRelease(
          Effect.try({
            try: () =>
              spawn?.() ??
              Bun.spawn(
                [process.execPath, "run", "--no-env-file", "--no-install", "--silent", childPath],
                {
                  cwd: request.projectRoot,
                  env: environment,
                  stdin: "pipe",
                  stdout: "pipe",
                  stderr: "pipe",
                },
              ),
            catch: (cause) => new EvaluatorProcessError({ operation: "spawn", cause }),
          }),
          (process) => terminateAndReap(process),
        );
        const stdout = yield* readOutput(child.stdout, "stdout").pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
        const stderr = yield* readOutput(child.stderr, "stderr").pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
        const work = Effect.all(
          [writeAndWait(child, request), Fiber.join(stdout), Fiber.join(stderr)],
          { concurrency: 3 },
        );
        const completed = yield* work.pipe(Effect.timeoutOption(request.timeoutMs));
        if (Option.isSome(completed)) {
          const [exitCode, out, err] = completed.value;
          return { exitCode, timedOut: false, stdout: out, stderr: err } satisfies ProcessResult;
        }
        // Readers remain owned by the outer scope so forced exit can still drain partial output.
        yield* terminateAndReap(child);
        const [out, err] = yield* Effect.all([Fiber.join(stdout), Fiber.join(stderr)], {
          concurrency: 2,
        });
        return {
          exitCode: yield* awaitExit(child),
          timedOut: true,
          stdout: out,
          stderr: err,
        } satisfies ProcessResult;
      }),
    );
  },
  (effect, request, childPath, spawn?: SpawnEvaluator) =>
    observeCompiler(
      "discovery",
      "runEvaluatorProcess",
      effect,
      () => ({ files: request.candidates.length }),
      false,
    ),
);

/**
 * Sends the request and waits for native child termination.
 * @param child - Scoped native process.
 * @param request - Validated input serialized to stdin.
 * @returns A lazy effect yielding its exit code or a typed input/exit failure.
 */
const writeAndWait = Effect.fn("Discovery.writeAndWait")(function* (
  child: EvaluatorProcess,
  request: EvaluatorRequest,
) {
  const serialized = yield* serializeJsonEffect(request).pipe(
    Effect.mapError((cause) => new EvaluatorProcessError({ operation: "stdin", cause })),
  );
  yield* Effect.tryPromise({
    try: async () => {
      await child.stdin.write(serialized);
      child.stdin.end();
    },
    catch: (cause) => new EvaluatorProcessError({ operation: "stdin", cause }),
  });
  return yield* awaitExit(child);
});

/**
 * Waits for the operating-system process exit without translating interruption.
 * @param child - Scoped native process.
 * @returns A lazy effect yielding its exit code or a typed native wait failure.
 */
const awaitExit = Effect.fn("Discovery.awaitExit")(function* (child: EvaluatorProcess) {
  return yield* Effect.tryPromise({
    try: () => child.exited,
    catch: (cause) => new EvaluatorProcessError({ operation: "exit", cause }),
  });
});

/**
 * Kills a live child and awaits native reaping during finalization.
 * @param child - Process owned by this request.
 * @returns A lazy effect completing after exit; cleanup errors remain defects.
 */
const terminateAndReap = Effect.fn("Discovery.terminateAndReap")(function* (
  child: EvaluatorProcess,
) {
  if (child.exitCode === null) child.kill("SIGKILL");
  yield* Effect.promise(() => child.exited);
});

/**
 * Drains a native byte pipe with scoped cancellation and UTF-8 decoding.
 * @param readable - Child output pipe.
 * @param operation - Output name retained in read diagnostics.
 * @returns A lazy effect yielding complete text or a typed native read failure.
 */
const readOutput = Effect.fn("Discovery.readOutput")(function* (
  readable: ReadableStream<Uint8Array>,
  operation: "stdout" | "stderr",
) {
  return yield* Stream.fromReadableStream({
    evaluate: () => readable,
    onError: (cause) => new EvaluatorProcessError({ operation, cause }),
  }).pipe(Stream.decodeText(), Stream.mkString);
});
