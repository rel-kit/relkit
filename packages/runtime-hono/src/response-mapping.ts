import { InvocationValidationError } from "@zsys/engine";
import type { HttpTriggerRegistration } from "@zsys/graph";
import {
  isInvocationFailure,
  normalizeFailure,
  toFailureTelemetry,
  toPublicEnvelope,
  type InvocationFailure,
} from "@zsys/runtime-effect";
import { validate, type StandardIssue, type StandardSchemaV1 } from "@zsys/schema";
import type { RequestMappingIssue } from "./request-mapping.js";
import {
  findError,
  findResponse,
  findSchema,
  findSuccess,
  findValidation,
  genericResponse,
  jsonResponse,
  responseStatus,
  type ResponseDeclaration,
  safeIssue,
} from "./response-mapping-utils.js";

export type ResponseMode = "development" | "test" | "production";
export type { ResponseSchemaEntries } from "./response-mapping-utils.js";
import type { ResponseSchemaEntries } from "./response-mapping-utils.js";

export interface ResponseMappingOptions {
  readonly mode?: ResponseMode;
  readonly responseSchemas?: ResponseSchemaEntries;
  readonly signal?: AbortSignal;
  readonly responseId?: string;
}

/** Converts one successful engine result or normalized engine failure to HTTP. */
export function mapResponse(
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  return isFailure(value)
    ? mapFailureResponse(trigger, value, options)
    : mapSuccessResponse(trigger, value, options);
}

export async function mapSuccessResponse(
  trigger: HttpTriggerRegistration,
  value: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  const declaration = findSuccess(trigger, options.responseId);
  if (value instanceof Response) return value;
  if (await responseIsValid(trigger, declaration, value, options)) {
    try {
      return jsonResponse(value, responseStatus(declaration, 200));
    } catch {
      return genericResponse("internal-error", 500);
    }
  }
  return genericResponse("internal-error", 500);
}

export async function mapFailureResponse(
  trigger: HttpTriggerRegistration,
  cause: unknown,
  options: ResponseMappingOptions = {},
): Promise<Response> {
  if (cause instanceof InvocationValidationError && cause.phase === "input")
    return mapInputValidationResponse(trigger, cause.issues, options);
  if (cause instanceof InvocationValidationError && cause.phase === "output")
    return genericResponse("internal-error", 500);
  try {
    const failure = normalizeFailure(
      cause,
      options.signal === undefined ? {} : { signal: options.signal },
    );
    if (failure.kind === "application") {
      const declaration = findError(trigger, failure.id);
      if (declaration === undefined) return genericResponse("internal-error", 500);
      const body = toPublicEnvelope(failure);
      if (!(await responseIsValid(trigger, declaration, failure.data, options)))
        return genericResponse("internal-error", 500);
      const response = jsonResponse(body, responseStatus(declaration, 500));
      if (failure.retry === "later" && failure.afterMs !== undefined)
        response.headers.set("Retry-After", String(Math.ceil(failure.afterMs / 1000)));
      return response;
    }
    return genericFailureResponse(trigger, failure, options);
  } catch {
    return genericResponse("internal-error", 500);
  }
}

export async function mapInputValidationResponse(
  trigger: HttpTriggerRegistration,
  issues: readonly (StandardIssue | RequestMappingIssue)[],
  options: ResponseMappingOptions = {},
): Promise<Response> {
  const body = { error: "validation", issues: issues.map(safeIssue) };
  const declaration = findValidation(trigger);
  return (await responseIsValid(trigger, declaration, body, options))
    ? jsonResponse(body, responseStatus(declaration, 422))
    : genericResponse("internal-error", 500);
}

async function genericFailureResponse(
  trigger: HttpTriggerRegistration,
  failure: InvocationFailure,
  options: ResponseMappingOptions,
): Promise<Response> {
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
  return (await responseIsValid(trigger, declaration, body, options))
    ? jsonResponse(body, responseStatus(declaration, detail.status))
    : genericResponse("internal-error", 500);
}

function developmentProviderMessage(
  failure: InvocationFailure,
  mode: ResponseMode | undefined,
): string | undefined {
  if (failure.kind !== "provider" || mode !== "development") return undefined;
  const cause = toFailureTelemetry(failure, { mode: "development" }).internal?.cause;
  if (cause === null || typeof cause !== "object" || !("message" in cause)) return undefined;
  return typeof cause.message === "string" ? cause.message : undefined;
}

async function responseIsValid(
  trigger: HttpTriggerRegistration,
  declaration: ResponseDeclaration | undefined,
  value: unknown,
  options: ResponseMappingOptions,
): Promise<boolean> {
  if (options.mode === "production") return true;
  const schema = findSchema(trigger, declaration, options.responseSchemas);
  if (schema === undefined) return true;
  try {
    const result = await validate(schema, value as never);
    return "value" in result;
  } catch {
    return false;
  }
}

function isFailure(value: unknown): boolean {
  return value instanceof Error || isInvocationFailure(value);
}
