import type { BodyIssueCode } from "./request-mapping-body.js";

/** Contract for mapping value used by request mapping. */
export type MappingValue = string | readonly string[];

/** Contract for mapping request used by request mapping. */
export interface MappingRequest {
  readonly request: Request;
  readonly pathPattern?: string;
  readonly params: Readonly<Record<string, MappingValue>>;
  readonly query: Readonly<Record<string, MappingValue>>;
  readonly headers: Readonly<Record<string, MappingValue>>;
  readonly validated?: Readonly<Record<string, unknown>>;
}

/** Contract for request issue code used by request mapping. */
export type RequestIssueCode = "missing" | "duplicate" | "transform" | "mapping" | BodyIssueCode;

/** Contract for request mapping issue used by request mapping. */
export interface RequestMappingIssue {
  readonly code: RequestIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** Contract for request mapping success used by request mapping. */
export interface RequestMappingSuccess {
  readonly ok: true;
  readonly value: unknown;
}

/** Contract for request mapping failure used by request mapping. */
export interface RequestMappingFailure {
  readonly ok: false;
  readonly issues: readonly RequestMappingIssue[];
}

/** Contract for request mapping result used by request mapping. */
export type RequestMappingResult = RequestMappingSuccess | RequestMappingFailure;

/** request mapping options configuring dependencies, callbacks and runtime policy. */
export interface RequestMappingOptions {
  readonly transforms?: Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;
  readonly maxBodyBytes?: number;
}
