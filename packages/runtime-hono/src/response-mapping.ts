import { InvocationValidationError } from "@relkit/engine";
import type { HttpTriggerRegistration } from "@relkit/graph";
import {
  isInvocationFailure,
  normalizeFailure,
  toPublicEnvelope,
  type InvocationFailure,
} from "@relkit/runtime-effect";
import { type StandardIssue } from "@relkit/schema";
import { Context, Effect, Layer, Result } from "effect";
import { observeHttp, runHttp } from "./http-effect.js";
import type { RequestMappingIssue } from "./request-mapping.js";
import { developmentProviderMessage } from "./response-mapping-provider.js";
import {
  findError,
  findResponse,
  findSuccess,
  findValidation,
  genericResponse,
  jsonResponse,
  responseStatus,
  safeIssue,
} from "./response-mapping-utils.js";
import { responseIsValid } from "./response-mapping-validation.js";
import type { ResponseMappingOptions } from "./response-mapping.types.js";
export type { ResponseSchemaEntries } from "./response-mapping-utils.js";
export type { ResponseMappingOptions, ResponseMode } from "./response-mapping.types.js";

/** Serializes the declared success response after optional output-schema validation.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param value - Value inspected, validated or projected by this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An effect yielding the declared success response or a safe output-validation failure.
 */
const success = Effect.fn("ResponseMapping.success")(function* (
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions = {},
) {
  const declaration = findSuccess(trigger, options.responseId);
  if (value instanceof Response) return value;
  if (!(yield* responseIsValid(trigger, declaration, value, options)))
    return genericResponse("internal-error", 500);
  return yield* encodeJson(value, responseStatus(declaration, 200));
});

/** Maps declared failures to their public envelope without exposing native causes.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param cause - Native failure projected without exposing private exception details.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An effect yielding the declared public error response or a sanitized transport fallback.
 */
const failure = Effect.fn("ResponseMapping.failure")(function* (
  trigger: HttpTriggerRegistration,
  cause: unknown,
  options: ResponseMappingOptions = {},
) {
  if (cause instanceof InvocationValidationError && cause.phase === "input")
    return yield* validation(trigger, cause.issues, options);
  if (cause instanceof InvocationValidationError && cause.phase === "output")
    return genericResponse("internal-error", 500);
  const normalized = yield* Effect.result(
    Effect.try({
      try: () =>
        normalizeFailure(cause, options.signal === undefined ? {} : { signal: options.signal }),
      catch: (error) => error,
    }),
  );
  if (Result.isFailure(normalized)) return genericResponse("internal-error", 500);
  const failure = normalized.success;
  if (failure.kind !== "application")
    return yield* genericFailureResponse(trigger, failure, options);
  const declaration = findError(trigger, failure.id);
  if (
    declaration === undefined ||
    !(yield* responseIsValid(trigger, declaration, failure.data, options))
  )
    return genericResponse("internal-error", 500);
  const response = yield* encodeJson(toPublicEnvelope(failure), responseStatus(declaration, 500));
  if (failure.retry === "later" && failure.afterMs !== undefined)
    response.headers.set("Retry-After", String(Math.ceil(failure.afterMs / 1000)));
  return response;
});

/** Sanitizes validation issue paths before producing the declared validation response.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param issues - issues supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An effect yielding sanitized issues at the declared validation status, normally HTTP 422.
 */
const validation = Effect.fn("ResponseMapping.validation")(function* (
  trigger: HttpTriggerRegistration,
  issues: readonly (StandardIssue | RequestMappingIssue)[],
  options: ResponseMappingOptions = {},
) {
  const body = { error: "validation", issues: issues.map(safeIssue) };
  const declaration = findValidation(trigger);
  return (yield* responseIsValid(trigger, declaration, body, options))
    ? jsonResponse(body, responseStatus(declaration, 422))
    : genericResponse("internal-error", 500);
});

/** Response construction and validation share one replaceable domain contract. */
export class ResponseMapping extends Context.Service<
  ResponseMapping,
  {
    readonly success: typeof success;
    readonly failure: typeof failure;
    readonly validation: typeof validation;
  }
>()("@relkit/runtime-hono/ResponseMapping") {}

/** Live response policy, including safe public failure projection and configured schemas. */
export const ResponseMappingLive = Layer.succeed(ResponseMapping, {
  success: (...args) => observeHttp("response.success", success(...args)),
  failure: (...args) => observeHttp("response.failure", failure(...args)),
  validation: (...args) => observeHttp("response.validation", validation(...args)),
});

/** Converts one successful engine result or normalized engine failure to HTTP.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param value - Value inspected, validated or projected by this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise for the mapped success or public failure HTTP response.
 */
export function mapResponse(
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  return value instanceof Error || isInvocationFailure(value)
    ? mapFailureResponse(trigger, value, options)
    : mapSuccessResponse(trigger, value, options);
}

/** Executes successful response mapping at the native framework edge.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param value - Value inspected, validated or projected by this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise resolving the validated public HTTP response.
 */
export function mapSuccessResponse(
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  return runHttp(
    Effect.flatMap(ResponseMapping, (service) => service.success(trigger, value, options)).pipe(
      Effect.provide(ResponseMappingLive),
    ),
  );
}

/** Executes public failure mapping at the native framework edge.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param cause - Native failure projected without exposing private exception details.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise resolving a safe declared failure response.
 */
export function mapFailureResponse(
  trigger: HttpTriggerRegistration,
  cause: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  return runHttp(
    Effect.flatMap(ResponseMapping, (service) => service.failure(trigger, cause, options)).pipe(
      Effect.provide(ResponseMappingLive),
    ),
  );
}

/** Executes request-validation mapping at the native framework edge.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param issues - issues supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A Promise resolving the sanitized validation response.
 */
export function mapInputValidationResponse(
  trigger: HttpTriggerRegistration,
  issues: readonly (StandardIssue | RequestMappingIssue)[],
  options: ResponseMappingOptions = {},
): Promise<Response> {
  return runHttp(
    Effect.flatMap(ResponseMapping, (service) => service.validation(trigger, issues, options)).pipe(
      Effect.provide(ResponseMappingLive),
    ),
  );
}

/** Converts a serializable application value; invalid JSON values become safe HTTP failures.
 * @param value - Value inspected, validated or projected by this operation.
 * @param status - HTTP status associated with the observed response or lifecycle event.
 * @returns An effect yielding serialized JSON or a safe HTTP 500 response when serialization fails.
 */
const encodeJson = Effect.fn("ResponseMapping.encodeJson")((value: unknown, status: number) =>
  Effect.try({ try: () => jsonResponse(value, status), catch: (cause) => cause }).pipe(
    Effect.catch(() => Effect.succeed(genericResponse("internal-error", 500))),
  ),
);

/** Map a non-application failure to its declared response or bounded transport fallback.
 * @param trigger - Route declarations used to select an outcome-specific response.
 * @param failure - Normalized provider, cancellation, timeout or defect failure.
 * @param options - Runtime exposure mode and optional response schemas.
 * @returns An effect yielding a validated public failure response without native cause details.
 */
const genericFailureResponse = Effect.fn("ResponseMapping.genericFailure")(function* (
  trigger: HttpTriggerRegistration,
  failure: InvocationFailure,
  options: ResponseMappingOptions,
) {
  const { kind, outcome } = failure;
  const declaration = findResponse(trigger, [outcome, kind]);
  const details: Record<string, { readonly status: number; readonly error: string }> = {
    provider: { status: 502, error: "provider-failure" },
    "provider-failure": { status: 502, error: "provider-failure" },
    cancellation: { status: 499, error: "cancelled" },
    cancelled: { status: 499, error: "cancelled" },
    timeout: { status: 504, error: "timeout" },
    defect: { status: 500, error: "internal-error" },
  };
  const detail = details[outcome] ?? details[kind] ?? { status: 500, error: "internal-error" };
  const message = developmentProviderMessage(failure, options.mode);
  const body = { error: detail.error, ...(message === undefined ? {} : { message }) };
  return (yield* responseIsValid(trigger, declaration, body, options))
    ? yield* encodeJson(body, responseStatus(declaration, detail.status))
    : genericResponse("internal-error", 500);
});
