import { observeExecution } from "@relkit/contracts/operation";
import { Cause, Context, Effect, Exit, Layer, Scope } from "effect";
import { CandidatePlatform } from "./candidate-platform.js";
import { startCompiledCandidate } from "./candidate-start.js";
import {
  candidateContext,
  emit,
  emitFailure,
  entrypointIn,
  validateBound,
} from "./candidate-process.js";
import type {
  CandidateCompileResult,
  CandidateOptions,
  CompiledCandidate,
} from "./candidate.types.js";
import type { CandidateService } from "./candidate-service.types.js";
import { checkCandidateAbort, validateCandidate } from "./candidate-validation.js";

/** A generation owns one lazy compilation and one lazily acquired native process. */
export class SupervisorCandidate extends Context.Service<SupervisorCandidate, CandidateService>()(
  "relkit/supervisor/Candidate",
) {}

/**
 * Acquires dependencies promptly; compile/start work is cached only within this generation owner.
 * @param options - Generation identity and native compiler.
 * @returns A scoped authority requiring a replaceable CandidatePlatform Layer.
 * @remarks No TTL or capacity is introduced; disposal closes this generation's resources only.
 */
export function createCandidateLayer(options: CandidateOptions) {
  return Layer.effect(
    SupervisorCandidate,
    Effect.gen(function* () {
      const platform = yield* CandidatePlatform;
      const scope = yield* Effect.scope;
      const compile = yield* Effect.cached(
        observeExecution(
          "supervisor",
          "candidate.compile",
          Effect.gen(function* () {
            const context = yield* validateCandidate(() => candidateContext(options));
            let cleaning: Promise<void> | undefined;
            /** Shares filesystem settlement after generation workers finish. @returns Exactly-once native removal. */
            const cleanup = () =>
              (cleaning ??= platform.cleanup(context.directory, context.directoryRoot));
            yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () => platform.directory(context),
                catch: (error) => error,
              }),
              () => Effect.promise(cleanup),
            );
            emit(options.logger, {
              level: "info",
              event: "candidate.compile.started",
              token: options.token,
              directory: context.directory,
            });
            const workflow = Effect.gen(function* () {
              yield* checkCandidateAbort(options.signal);
              let nativeCompilation: Promise<CandidateCompileResult> | undefined;
              const result = yield* Effect.tryPromise({
                try: (signal) => {
                  nativeCompilation = Promise.resolve(
                    options.compile({
                      token: options.token,
                      projectRoot: context.projectRoot,
                      outputDirectory: context.directory,
                      signal:
                        options.signal === undefined
                          ? signal
                          : AbortSignal.any([signal, options.signal]),
                    }),
                  );
                  return nativeCompilation;
                },
                catch: (error) => error,
              }).pipe(
                Effect.onExit((exit) =>
                  Exit.isFailure(exit) &&
                  Cause.hasInterruptsOnly(exit.cause) &&
                  nativeCompilation !== undefined
                    ? Effect.promise(() =>
                        nativeCompilation!.then(
                          () => undefined,
                          () => undefined,
                        ),
                      )
                    : Effect.void,
                ),
              );
              yield* checkCandidateAbort(options.signal);
              const selected = result.entrypoint;
              const entrypoint = yield* validateCandidate(() =>
                entrypointIn(context.directory, selected),
              );
              yield* Effect.tryPromise({
                try: () => platform.access(entrypoint),
                catch: (error) => error,
              });
              emit(options.logger, {
                level: "info",
                event: "candidate.compile.succeeded",
                token: options.token,
                directory: context.directory,
                fields: { entrypoint },
              });
              return Object.freeze({
                token: options.token,
                directory: context.directory,
                entrypoint,
                ...(result.environment === undefined ? {} : { environment: result.environment }),
                cleanup,
              }) satisfies CompiledCandidate;
            });
            return yield* workflow.pipe(
              Effect.onExit((exit) =>
                exit._tag === "Failure"
                  ? Effect.sync(() =>
                      emitFailure(
                        options,
                        "candidate.compile.failed",
                        context.directory,
                        Cause.squash(exit.cause),
                      ),
                    )
                  : Effect.void,
              ),
            );
          }).pipe(Effect.provideService(Scope.Scope, scope)),
          () => ({ generations: 1 }),
        ),
      );

      const start = yield* Effect.cached(
        observeExecution(
          "supervisor",
          "candidate.start",
          Effect.gen(function* () {
            const limit = options.maxStartupOutputBytes ?? 8 * 1024;
            const timeout = options.stopTimeoutMs ?? 1_000;
            yield* validateCandidate(() => {
              validateBound(limit, "maxStartupOutputBytes", false);
              validateBound(timeout, "stopTimeoutMs", true);
            });
            const compiled = yield* compile;
            return yield* startCompiledCandidate(
              options,
              compiled,
              platform,
              scope,
              limit,
              timeout,
            );
          }).pipe(Effect.provideService(Scope.Scope, scope)),
          () => ({ generations: 1 }),
        ),
      );
      return SupervisorCandidate.of({ compile, start });
    }),
  );
}
