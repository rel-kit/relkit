import type { AccessResolver, JsonValue } from "../contracts/index.js";

/** Contract for http auth invocation used by auth. */
export interface HttpAuthInvocation {
  readonly getSession: (options?: { readonly fresh?: boolean }) => Promise<unknown | null>;
}

/** Contract for http auth runtime used by auth. */
export interface HttpAuthRuntime {
  readonly contextFor: (request: Request) => HttpAuthInvocation;
  readonly getOpenApiDocument?: () => Promise<JsonValue>;
  /** Reads a session's roles and permissions for function access rules. */
  readonly resolveAccess?: AccessResolver;
}

/** create http auth runtime options configuring dependencies, callbacks and runtime policy. */
export interface CreateHttpAuthRuntimeOptions {
  readonly getSession: (headers: Headers) => Promise<unknown | null>;
  readonly getOpenApiDocument?: () => Promise<JsonValue>;
  readonly resolveAccess?: AccessResolver;
}
