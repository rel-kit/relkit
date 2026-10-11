import { API_VERSION, isRuntimeActivationFingerprint } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Clock, Context, Effect, Exit, Layer } from "effect";
import { verifyActivationFingerprint } from "./verification-fingerprint.js";
import { validateVerification, rejectVerification } from "./verification-errors.js";
import {
  pollHealth,
  readinessState,
  requiredProbe,
  verifyGraph,
  verifyIdentity,
} from "./verification-probe.js";
import { CandidateVerificationError } from "./verification-error.js";
import { DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS } from "./verification-data.js";
import type { CandidateVerificationOptions } from "./verification.types.js";
import type {
  VerificationPlatformService,
  VerificationService,
} from "./verification-service.types.js";

/** Acquired native HTTP boundary; options override this platform only within their owner. */
export class VerificationPlatform extends Context.Service<
  VerificationPlatform,
  VerificationPlatformService
>()("relkit/supervisor/VerificationPlatform") {}

/** Candidate readiness, API and activation identity authority. */
export class CandidateVerification extends Context.Service<
  CandidateVerification,
  VerificationService
>()("relkit/supervisor/CandidateVerification") {}

/** Default native probe adapter; no request starts during acquisition. */
export const VerificationPlatformLive = Layer.succeed(VerificationPlatform, { fetch });

/**
 * Acquires verification dependencies once and leaves request work lazy.
 * @param options - Expected candidate identity, options and caller cancellation.
 * @returns A replaceable verification workflow requiring the native platform Layer.
 * @remarks Every probe and poll shares one deadline; no endpoint gets a fresh timeout.
 */
export function createVerificationLayer(options: CandidateVerificationOptions) {
  return Layer.effect(
    CandidateVerification,
    Effect.gen(function* () {
      const platform = yield* VerificationPlatform;
      const fetcher = options.fetch ?? platform.fetch;
      return CandidateVerification.of({
        verify: Effect.fn("CandidateVerification.verify")(function* () {
          return yield* observeExecution(
            "supervisor",
            "candidate.verify",
            Effect.gen(function* () {
              const timeout = options.healthTimeoutMs ?? DEFAULT_CANDIDATE_HEALTH_TIMEOUT_MS;
              yield* Effect.try({
                try: () => validateOptions(options, timeout),
                catch: (error) => {
                  if (error instanceof TypeError || error instanceof RangeError) return error;
                  throw error;
                },
              });
              const workflow = Effect.gen(function* () {
                const deadline = (yield* Clock.currentTimeMillis) + timeout;
                const liveProbe = pollHealth(
                  options,
                  "/health/live",
                  deadline,
                  (probe) => {
                    verifyActivationFingerprint(probe.payload, options.activationFingerprint);
                    return probe.response.ok && probe.payload.status === "ok";
                  },
                  fetcher,
                );
                const readyProbe = pollHealth(
                  options,
                  "/health/ready",
                  deadline,
                  (probe) => {
                    verifyActivationFingerprint(probe.payload, options.activationFingerprint);
                    const readiness = readinessState(probe.payload);
                    return (
                      probe.response.ok &&
                      probe.payload.status === "ready" &&
                      readiness.environmentReady &&
                      readiness.providerReady
                    );
                  },
                  fetcher,
                );
                const [live, ready] = options.concurrentHealth
                  ? yield* Effect.all([liveProbe, readyProbe], { concurrency: "unbounded" })
                  : [yield* liveProbe, yield* readyProbe];
                let identitySeen = yield* validateVerification(() =>
                  verifyIdentity(live.payload, options.candidate.token),
                );
                identitySeen =
                  (yield* validateVerification(() =>
                    verifyIdentity(ready.payload, options.candidate.token),
                  )) || identitySeen;
                const graph = yield* requiredProbe(options, "/graph", deadline, fetcher);
                identitySeen =
                  (yield* validateVerification(() =>
                    verifyIdentity(graph.payload, options.candidate.token),
                  )) || identitySeen;
                const activationFingerprint = yield* validateVerification(() =>
                  verifyActivationFingerprint(graph.payload, options.activationFingerprint),
                );
                const graphValues = yield* validateVerification(() =>
                  verifyGraph(graph.payload, options),
                );
                if (!identitySeen)
                  return yield* rejectVerification(
                    new CandidateVerificationError(
                      "RELKIT_CANDIDATE_RESPONSE_INVALID",
                      "Candidate health responses did not identify their generation.",
                    ),
                  );
                return Object.freeze({
                  token: options.candidate.token,
                  ...graphValues,
                  activationFingerprint,
                  apiVersion: API_VERSION,
                  environmentReady: true as const,
                  providerReady: true as const,
                });
              });
              return yield* workflow.pipe(
                Effect.onExit((exit) =>
                  Exit.isFailure(exit) && options.candidate.dispose !== undefined
                    ? Effect.tryPromise({
                        try: () => options.candidate.dispose!(),
                        catch: (error) => error,
                      }).pipe(Effect.catchCause(() => Effect.void))
                    : Effect.void,
                ),
              );
            }),
            () => ({ endpoints: 3 }),
          );
        })(),
      });
    }),
  );
}

/** Validates admission without disposing a candidate whose verification never began.
 * @param options - Public candidate options. @param timeout - Resolved timeout.
 * @returns Nothing. @throws Existing TypeError/RangeError/caller abort objects.
 */
function validateOptions(options: CandidateVerificationOptions, timeout: number): void {
  if (!Number.isSafeInteger(options.candidate.port) || options.candidate.port < 1)
    throw new TypeError("Candidate verification requires a valid backend port.");
  if (!isRuntimeActivationFingerprint(options.activationFingerprint))
    throw new TypeError("Candidate activation fingerprint is required.");
  if (!Number.isSafeInteger(timeout) || timeout < 1)
    throw new RangeError("healthTimeoutMs must be a positive safe integer.");
  if (options.signal?.aborted)
    throw options.signal.reason ?? new Error("Verification was aborted.");
}
