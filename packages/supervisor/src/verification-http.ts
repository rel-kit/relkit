import { API_BASE_PATH } from "@relkit/contracts";
import { Clock, Effect } from "effect";
import type { CandidateProbeResponse, CandidateVerificationOptions } from "./verification.types.js";
import { CandidateVerificationError } from "./verification-error.js";
import { rejectVerification } from "./verification-errors.js";

/**
 * Performs one bounded probe with a real native signal for both fetch and body consumption.
 * @param options - Candidate identity and explicit request cancellation.
 * @param path - Declaration-owned internal endpoint.
 * @param deadline - Shared absolute deadline from the injected Clock.
 * @param fetcher - Acquired native platform boundary.
 * @returns A valid object response, or undefined for unavailable/expired probes.
 */
export function requestProbe(
  options: CandidateVerificationOptions,
  path: string,
  deadline: number,
  fetcher: typeof fetch,
): Effect.Effect<CandidateProbeResponse | undefined, unknown> {
  return Effect.gen(function* () {
    if (options.signal?.aborted)
      return yield* Effect.fail(options.signal.reason ?? new Error("Verification was aborted."));
    const remaining = deadline - (yield* Clock.currentTimeMillis);
    if (remaining <= 0) return undefined;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const controller = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (value) => Effect.sync(() => value.abort()),
        );
        const url = `http://${options.hostname ?? "127.0.0.1"}:${options.candidate.port}${API_BASE_PATH}${path}`;
        const response = Effect.tryPromise({
          try: async (signal) => {
            const response = await fetcher(url, {
              signal: AbortSignal.any([
                signal,
                controller.signal,
                ...(options.signal === undefined ? [] : [options.signal]),
              ]),
            });
            const payload: unknown = await response.json();
            if (!isRecord(payload))
              throw new CandidateVerificationError(
                "RELKIT_CANDIDATE_RESPONSE_INVALID",
                "Candidate health response must be a JSON object.",
              );
            return { response, payload };
          },
          catch: (error) => error,
        }).pipe(
          Effect.catch((error) =>
            error instanceof CandidateVerificationError
              ? rejectVerification(error)
              : Effect.succeed(undefined),
          ),
        );
        return yield* Effect.raceFirst(response, Effect.as(Effect.sleep(remaining), undefined));
      }),
    );
  });
}

/** Checks only the decoded envelope shape.
 * @param value - Native JSON result. @returns Whether it is an object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
