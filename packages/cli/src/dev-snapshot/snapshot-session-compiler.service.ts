/**
 * Uses the one validated snapshot for the initial generation, then lazily acquires
 * the existing safe compiler for every edited generation. The public SDK callback
 * is a session-owned FIFO bridge; callbacks never run an Effect themselves.
 */
import { Context, Effect, Exit, Layer, Ref, Scope } from "effect";
import type { CandidateCompileRequest } from "@relkit/supervisor";
import { observeExecution } from "@relkit/contracts/operation";
import { makeDevCompilerBridgeEffect } from "../commands/dev-compiler-bridge.js";
import { cliAdapterError } from "../cli-errors.js";
import { SnapshotCandidates } from "./snapshot-candidate.service.js";
import { SnapshotFallbackCompilers } from "./snapshot-fallback.service.js";
import type { EffectDevLocalCompiler } from "../commands/dev-local.types.js";
import type { SnapshotCandidateRequest } from "./snapshot-candidate.types.js";
import { SnapshotReadinessRequests } from "./snapshot-readiness-requests.js";
import type {
  SnapshotSessionCompiler,
  SnapshotSessionCompilerOperations,
  SnapshotSessionCompilerRequest,
} from "./snapshot-session-compiler.types.js";

/** Session compiler policy captures its two runtime-neutral authorities during make. */
export class SnapshotSessionCompilers extends Context.Service<
  SnapshotSessionCompilers,
  SnapshotSessionCompilerOperations
>()("relkit/DevSnapshot/SessionCompilers", {
  make: Effect.gen(function* () {
    const candidates = yield* SnapshotCandidates;
    const fallback = yield* SnapshotFallbackCompilers;
    return {
      acquire: (request) =>
        observeExecution(
          "cli",
          "dev.snapshot.compiler.acquire",
          acquireCompiler(request, candidates, fallback),
        ),
    } satisfies SnapshotSessionCompilerOperations;
  }),
}) {}

/** Exposes scoped policy with live or deterministic test dependencies supplied explicitly. */
export const snapshotSessionCompilersLive = Layer.effect(
  SnapshotSessionCompilers,
  SnapshotSessionCompilers.make,
);

/**
 * Owns the SDK callback bridge and tracks which child was installed from the receipt.
 * @param request - Validated cohort and input epoch established before validation.
 * @param candidates - Captured immutable installer and readiness prover.
 * @param fallback - Captured lazy safe-compiler acquisition.
 * @returns Session-only callbacks; native workers and lazy authorities join Scope release.
 */
const acquireCompiler = Effect.fn("DevSnapshot.sessionCompiler")(function* (
  request: SnapshotSessionCompilerRequest,
  candidates: SnapshotCandidates["Service"],
  fallback: SnapshotFallbackCompilers["Service"],
) {
  const scope = yield* Scope.Scope;
  const initial = yield* Ref.make(true);
  const safe = yield* Ref.make<EffectDevLocalCompiler | undefined>(undefined);
  const readinessPath =
    request.snapshot.receipt.readiness.kind === "graph"
      ? "/_relkit/v1/graph"
      : request.snapshot.receipt.readiness.path;
  const readiness = new SnapshotReadinessRequests(readinessPath);
  yield* Effect.addFinalizer(() => Effect.sync(() => readiness.close()));
  let installed: SnapshotCandidateRequest | undefined;
  const compile = Effect.fn("DevSnapshot.compileSelected")(function* (
    candidate: CandidateCompileRequest,
  ) {
    if ((yield* Ref.getAndSet(initial, false)) && request.epoch.isCurrent(request.token)) {
      const next = { ...request, projectRoot: request.options.projectRoot, candidate };
      const result = yield* candidates.install(next);
      installed = next;
      return result;
    }
    let compiler = yield* Ref.get(safe);
    if (compiler === undefined) {
      compiler = yield* fallback
        .acquire(request.options)
        .pipe(Effect.provideService(Scope.Scope, scope));
      yield* Ref.set(safe, compiler);
    }
    yield* compiler.invalidateEffect;
    return yield* compiler.compileEffect(candidate);
  });
  const bridge = yield* makeDevCompilerBridgeEffect(compile, scope);
  yield* Effect.addFinalizer(() => Effect.sync(bridge.close));
  const prepared = (child: import("@relkit/supervisor").StartedCandidate) =>
    installed?.candidate.token.generationToken === child.token.generationToken
      ? installed
      : undefined;
  return {
    compile: bridge.compile,
    fingerprint: (child) => prepared(child)?.snapshot.receipt.activation,
    admission: (child) => prepared(child) === undefined || request.epoch.isCurrent(request.token),
    verify: (child, signal) => {
      const selected = prepared(child);
      if (selected === undefined) return Effect.void;
      return Effect.gen(function* () {
        const publicRequest = yield* Effect.promise(() => readiness.claim(child));
        yield* request.verification.pipe(
          Effect.mapError((error) => cliAdapterError("dev.snapshot.current", error)),
        );
        const response = yield* candidates.probe(selected, child, signal, publicRequest);
        readiness.stage(child, response);
      }).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit) ? Effect.sync(() => readiness.reject(child)) : Effect.void,
        ),
      );
    },
    intercept: (request) => readiness.intercept(request),
    publish: (child) => readiness.publish(child),
    reject: (child) => readiness.reject(child),
  } satisfies SnapshotSessionCompiler;
});
