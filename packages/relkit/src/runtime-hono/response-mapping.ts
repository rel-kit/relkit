import { isJsonValue } from "../contracts/index.js";
import { InvocationValidationError } from "../engine/index.js";
import type { HttpTriggerRegistration } from "../graph/index.js";
import {
  isInvocationFailure,
  normalizeFailure,
  type InvocationFailure,
} from "../runtime-effect/index.js";
import { type StandardIssue } from "../schema/index.js";
import { Context, Effect, Layer, Result } from "effect";
import { observeHttp, runHttp } from "./http-effect.js";
import type { RequestMappingIssue } from "./request-mapping.js";
import { problemBody, problemResponse } from "./problem-details.js";
import { encodeJson, encodeProblem, genericFailureResponse } from "./response-mapping-encode.js";
import { developmentFailureMessage } from "./response-mapping-provider.js";
import {
  findError,
  findResponse,
  findSuccess,
  findValidation,
  internalErrorResponse,
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
    return internalErrorResponse(options.traceId);
  return yield* encodeJson(value, responseStatus(declaration, 200), options.traceId);
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
    return internalErrorResponse(options.traceId);
  const normalized = yield* Effect.result(
    Effect.try({
      try: () =>
        normalizeFailure(cause, options.signal === undefined ? {} : { signal: options.signal }),
      catch: (error) => error,
    }),
  );
  if (Result.isFailure(normalized)) return internalErrorResponse(options.traceId);
  const failure = normalized.success;
  if (failure.kind !== "application")
    return yield* genericFailureResponse(trigger, failure, options);
  const declaration = findError(trigger, failure.id);
  if (
    declaration === undefined ||
    !(yield* responseIsValid(trigger, declaration, failure.data, options))
  )
    return internalErrorResponse(options.traceId);
  return yield* encodeProblem({
    ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
    status: responseStatus(declaration, 500),
    code: failure.id,
    detail: failure.message,
    ...(isJsonValue(failure.data) ? { data: failure.data } : {}),
    ...(failure.retry === "later" && failure.afterMs !== undefined
      ? { retryAfterMs: failure.afterMs }
      : {}),
  });
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
  const declaration = findValidation(trigger);
  const status = responseStatus(declaration, 422);
  const problem = problemBody({
    status,
    code: "validation",
    detail: "The request input is invalid.",
    issues: issues.map(safeIssue),
    ...(options.traceId === undefined ? {} : { traceId: options.traceId }),
  });
  return (yield* responseIsValid(trigger, declaration, problem, options))
    ? problemResponse({ ...problem, status })
    : internalErrorResponse(options.traceId);
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
