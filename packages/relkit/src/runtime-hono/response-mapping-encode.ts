/** Encodes response bodies and maps runtime failures to their Problem Details responses. */
import type { HttpTriggerRegistration } from "../graph/index.js";
import type { InvocationFailure } from "../runtime-effect/index.js";
import { Effect } from "effect";
import { problemBody, problemResponse, type ProblemInput } from "./problem-details.js";
import { developmentFailureMessage } from "./response-mapping-provider.js";
import {
  findResponse,
  internalErrorResponse,
  jsonResponse,
  responseStatus,
} from "./response-mapping-utils.js";
import { responseIsValid } from "./response-mapping-validation.js";
import type { ResponseMappingOptions } from "./response-mapping.types.js";

/** Encodes a problem; data that cannot be serialized becomes the safe 500 problem.
 * @param input - Problem fields.
 * @returns An effect yielding the problem response.
 */
export const encodeProblem = Effect.fn("ResponseMapping.encodeProblem")((input: ProblemInput) =>
  Effect.try({ try: () => problemResponse(input), catch: (cause) => cause }).pipe(
    Effect.catch(() => Effect.succeed(internalErrorResponse(input.traceId))),
  ),
);

/** Converts a serializable application value; invalid JSON values become safe HTTP failures.
 * @param value - Value inspected, validated or projected by this operation.
 * @param status - HTTP status associated with the observed response or lifecycle event.
 * @returns An effect yielding serialized JSON or a safe HTTP 500 response when serialization fails.
 */
export const encodeJson = Effect.fn("ResponseMapping.encodeJson")(
  (value: unknown, status: number, traceId?: string) =>
    Effect.try({ try: () => jsonResponse(value, status), catch: (cause) => cause }).pipe(
      Effect.catch(() => Effect.succeed(internalErrorResponse(traceId))),
    ),
);

/** Map a non-application failure to its declared response or bounded transport fallback.
 * @param trigger - Route declarations used to select an outcome-specific response.
 * @param failure - Normalized provider, cancellation, timeout or defect failure.
 * @param options - Runtime exposure mode and optional response schemas.
 * @returns An effect yielding a validated public failure response without native cause details.
 */
export const genericFailureResponse = Effect.fn("ResponseMapping.genericFailure")(function* (
  trigger: HttpTriggerRegistration,
  failure: InvocationFailure,
  options: ResponseMappingOptions,
) {
  const { kind, outcome } = failure;
  const declaration = findResponse(trigger, [outcome, kind]);
  const defaults: Record<
    string,
    { readonly status: number; readonly code: string; readonly detail: string }
  > = {
    provider: {
      status: 502,
      code: "provider-failure",
      detail: "A dependency of this request failed.",
    },
    "provider-failure": {
      status: 502,
      code: "provider-failure",
      detail: "A dependency of this request failed.",
    },
    cancellation: { status: 499, code: "cancelled", detail: "The request was cancelled." },
    cancelled: { status: 499, code: "cancelled", detail: "The request was cancelled." },
    timeout: { status: 504, code: "timeout", detail: "The request timed out." },
    defect: { status: 500, code: "internal-error", detail: "The request failed unexpectedly." },
  };
  const selected = defaults[outcome] ??
    defaults[kind] ?? {
      status: 500,
      code: "internal-error",
      detail: "The request failed unexpectedly.",
    };
  const message = developmentFailureMessage(failure, options.mode);
  const status = responseStatus(declaration, selected.status);
  const problem = problemBody({
    status,
    code: selected.code,
    detail: message ?? selected.detail,
    ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
  });
  return (yield* responseIsValid(trigger, declaration, problem, options))
    ? yield* encodeProblem({ ...problem, status })
    : internalErrorResponse(options.traceId);
});
