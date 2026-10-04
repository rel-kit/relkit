import { Cause, Effect, Exit, Fiber, Scope } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { childEnvironment, emit, emitFailure } from "./candidate-process.js";
import { checkCandidateAbort } from "./candidate-validation.js";
import type {
  CandidateOptions,
  CandidateOutput,
  CompiledCandidate,
  StartedCandidate,
} from "./candidate.types.js";
import type { CandidatePlatformService } from "./candidate-service.types.js";

/**
 * Acquires a native process and attaches output/exit workers before returning it.
 * @param options - Candidate identity and native configuration.
 * @param compiled - Already owned directory and entrypoint.
 * @param platform - Acquired native process boundary.
 * @param scope - Generation owner scope retaining every worker.
 * @param limit - Shared retained stdout/stderr byte budget.
 * @param timeout - Native graceful-stop bound before forceful termination.
 * @returns The started candidate; owner release stops and drains it before directory cleanup.
 */
export function startCompiledCandidate(
  options: CandidateOptions,
  compiled: CompiledCandidate,
  platform: CandidatePlatformService,
  scope: Scope.Scope,
  limit: number,
  timeout: number,
): Effect.Effect<StartedCandidate, unknown, Scope.Scope> {
  const workflow = Effect.gen(function* () {
    yield* Effect.interruptible(Effect.void);
    yield* checkCandidateAbort(options.signal);
    const port = yield* Effect.tryPromise({
      try: () => platform.port(options, options.hostname ?? "127.0.0.1"),
      catch: (error) => error,
    }).pipe(Effect.uninterruptible);
    // The allocator has no cancellation contract. Join its native release first,
    // then honor pending owner interruption before admitting any native process.
    yield* Effect.interruptible(Effect.void);
    yield* checkCandidateAbort(options.signal);
    const environment = childEnvironment(
      { ...options.environment, ...compiled.environment },
      options.token,
      port,
    );
    emit(options.logger, {
      level: "info",
      event: "candidate.start.started",
      token: options.token,
      directory: compiled.directory,
      fields: { port },
    });
    let stopping: Promise<void> | undefined;
    const context = yield* Effect.context<never>();
    let child: Bun.ReadableSubprocess;
    const stopEffect = yield* Effect.cached(
      observeExecution(
        "supervisor",
        "candidate.stop",
        Effect.tryPromise({ try: () => platform.stop(child, timeout), catch: (error) => error }),
        () => ({ processes: 1 }),
      ),
    );
    /** Shares physical termination in the captured owner context. @returns Only after the actual child exits. */
    const stop = (): Promise<void> =>
      (stopping ??= Effect.runPromiseExitWith(context)(stopEffect).then((exit) => {
        if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
      }));
    const stopFinalizer = stopEffect.pipe(Effect.catch((error) => Effect.die(error)));
    child = yield* Effect.acquireRelease(
      Effect.try({
        try: () => platform.spawn(compiled.entrypoint, options, environment),
        catch: (error) => error,
      }),
      () => stopFinalizer,
    );
    const outputController = new AbortController();
    const outputFiber = yield* Effect.forkIn(
      observeExecution(
        "supervisor",
        "candidate.output",
        Effect.tryPromise({
          try: (signal) =>
            platform.output(
              child,
              options,
              compiled.directory,
              limit,
              AbortSignal.any([signal, outputController.signal]),
            ),
          catch: (error) => error,
        }),
        () => ({ streams: 2 }),
      ).pipe(
        Effect.interruptible,
        Effect.onExit((exit) => (Exit.isFailure(exit) ? stopFinalizer : Effect.void)),
      ),
      scope,
      { startImmediately: true },
    );
    const output = new Promise<CandidateOutput>((resolve, reject) =>
      outputFiber.addObserver((exit) => {
        if (exit._tag === "Success") resolve(exit.value);
        else reject(Cause.squash(exit.cause));
      }),
    );
    void output.catch(() => undefined);
    const exited = child.exited;
    const exitFiber = yield* Effect.forkIn(
      observeExecution(
        "supervisor",
        "candidate.exit",
        Effect.promise(() => exited).pipe(
          Effect.flatMap((exitCode) =>
            Effect.sync(() => {
              emit(options.logger, {
                level: exitCode === 0 ? "info" : "error",
                event: "candidate.process-exited",
                token: options.token,
                directory: compiled.directory,
                fields: { exitCode },
              });
              return exitCode;
            }),
          ),
        ),
        () => ({ processes: 1 }),
        (exit) => (Exit.isSuccess(exit) && exit.value !== 0 ? "failure" : true),
      ).pipe(Effect.interruptible),
      scope,
    );
    // This later finalizer stops the actual child and drains output before child-fiber finalizers.
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* stopFinalizer;
        outputController.abort(new Error("Candidate output owner closed."));
        yield* Fiber.await(outputFiber);
        yield* Fiber.await(exitFiber);
      }),
    );
    emit(options.logger, {
      level: "info",
      event: "candidate.start.succeeded",
      token: options.token,
      directory: compiled.directory,
      fields: { port, pid: child.pid },
    });
    return Object.freeze({
      ...compiled,
      port,
      pid: child.pid,
      process: child,
      exited,
      output,
      stop,
      dispose: async () => {
        await stop();
        await compiled.cleanup();
      },
    }) satisfies StartedCandidate;
  });
  return workflow.pipe(
    Effect.uninterruptible,
    Effect.onExit((exit) =>
      exit._tag === "Failure"
        ? Effect.sync(() =>
            emitFailure(
              options,
              "candidate.start.failed",
              compiled.directory,
              Cause.squash(exit.cause),
            ),
          )
        : Effect.void,
    ),
  );
}
