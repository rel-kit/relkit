import type { ClientIdentityDocument } from "@relkit/contracts";
import { createAutoClient, createClient, createWebSocketClient } from "../transport.js";
import type { ClientHeaders } from "../index.types.js";
import type { RelkitKeyScope } from "./keys.js";
import { createAgentSseClient } from "./agent-sse-client.js";

/**
 * Reads the current browser backend origin or the existing local fallback.
 * @returns The browser origin or local development fallback.
 */
export function browserOrigin(): string {
  return (
    (globalThis as { location?: { readonly origin: string } }).location?.origin ??
    "http://127.0.0.1:3000"
  );
}

/**
 * Selects query entries owned by RELKIT's existing key prefix.
 * @param query - Existing query descriptor.
 * @returns Whether the query key belongs to RELKIT.
 */
export function isRelkitQuery(query: { readonly queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] === "relkit";
}

/**
 * Reads the existing browser or Next public fingerprint binding.
 * @returns The configured fingerprint, or undefined when no binding exists.
 */
export function compiledFingerprint(): string | undefined {
  return (
    (globalThis as { __RELKIT_PUBLIC_FINGERPRINT__?: string }).__RELKIT_PUBLIC_FINGERPRINT__ ??
    (typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_RELKIT_PUBLIC_FINGERPRINT)
  );
}

/**
 * Reads the existing backend identity document with caller-owned cancellation.
 * @param baseUrl - Configured backend root URL.
 * @param credentials - Existing native credential policy.
 * @param signal - Borrowed caller cancellation signal.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function loadIdentity(
  baseUrl: string,
  credentials: NonNullable<RequestInit["credentials"]>,
  signal: AbortSignal,
): Promise<ClientIdentityDocument> {
  const response = await fetch(new URL("/_relkit/v1/client/identity", baseUrl), {
    credentials,
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Relkit identity request failed (${response.status})`);
  return response.json() as Promise<ClientIdentityDocument>;
}

/**
 * Attaches existing identity, jobs protocol and CSRF authority to current headers.
 * @param value - Original input or payload; its identity is retained where required.
 * @param identity - Existing application identity authority.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function identityHeaders(
  value: ClientHeaders | undefined,
  identity: ClientIdentityDocument | undefined,
): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  const headers = new Headers(resolved as ConstructorParameters<typeof Headers>[0]);
  if (identity) {
    headers.set("x-relkit-identity-scope", identity.identityScope);
    headers.set("x-relkit-session-epoch", identity.sessionEpoch);
    if (identity.jobs !== undefined) {
      headers.set("x-relkit-jobs-protocol", String(identity.jobs.version));
      headers.set("x-relkit-public-fingerprint", identity.publicFingerprint);
    }
  }
  const csrf = browserCookie("relkit_csrf");
  if (csrf !== undefined && !headers.has("x-relkit-csrf")) {
    headers.set("x-relkit-csrf", csrf);
  }
  return headers;
}

/**
 * Reads and decodes one existing browser cookie without retaining document state.
 * @param name - Declared resource or selector identity.
 * @returns The decoded cookie value, or undefined when absent.
 */
function browserCookie(name: string): string | undefined {
  const cookie = (globalThis as { document?: { readonly cookie: string } }).document?.cookie;
  const value = cookie
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return value === undefined ? undefined : decodeURIComponent(value.slice(name.length + 1));
}

/**
 * Creates the finite native fetch edge with combined caller and deadline signals.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @returns A fetch adapter whose deadline also cancels its owned request.
 */
export function finiteFetcher(timeoutMs: number): typeof fetch {
  return ((input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  }) as typeof fetch;
}

/**
 * Bounds native stream establishment without timing out the subsequent live stream.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @returns A fetch adapter whose deadline ends after stream establishment.
 */
export function streamFetcher(timeoutMs: number): typeof fetch {
  return (async (input, init) => {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DOMException("Stream establishment timed out.", "TimeoutError")),
      timeoutMs,
    );
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      if (controller.signal.aborted) init?.signal?.removeEventListener("abort", onAbort);
    }
  }) as typeof fetch;
}

/**
 * Selects the existing HTTP, WebSocket, auto or SSE procedure adapter.
 * @param options - Existing public configuration and authority.
 * @returns The configured stream procedure client.
 */
export function streamClientFor(options: {
  readonly baseUrl: string;
  readonly credentials: NonNullable<RequestInit["credentials"]>;
  readonly headers: ClientHeaders | undefined;
  readonly transport: "auto" | "websocket" | "http-stream" | "sse" | undefined;
  readonly timeoutMs: number;
  readonly identity: ClientIdentityDocument | undefined;
}): ReturnType<typeof createClient> {
  if (options.transport === "websocket" && typeof WebSocket !== "undefined") {
    return createWebSocketClient({
      baseUrl: options.baseUrl,
      establishmentTimeoutMs: options.timeoutMs,
      headers: () => identityHeaders(options.headers, options.identity),
    });
  }
  const shared = {
    baseUrl: options.baseUrl,
    credentials: options.credentials,
    headers: () => identityHeaders(options.headers, options.identity),
    fetch: streamFetcher(options.timeoutMs),
  };
  if (options.transport === "sse") {
    return createAgentSseClient(shared, createClient(shared)) as ReturnType<typeof createClient>;
  }
  return options.transport === "http-stream"
    ? createClient(shared)
    : createAutoClient({ ...shared, establishmentTimeoutMs: options.timeoutMs });
}

/**
 * Constructs the complete existing backend and identity hydration/query scope.
 * @param backend - Configured backend identity.
 * @param identity - Existing application identity authority.
 * @param identityKey - Caller identity key used for isolation.
 * @param environment - Explicit environment boundary.
 * @returns The complete backend, fingerprint, identity and session key scope.
 */
export function scopeFor(
  backend: string,
  identity: ClientIdentityDocument,
  identityKey: string | null | undefined,
  environment?: string,
): RelkitKeyScope {
  return {
    backend,
    applicationId: identity.applicationId,
    identityScope: identity.identityScope,
    sessionEpoch: identity.sessionEpoch,
    identityKey,
    publicFingerprint: identity.publicFingerprint,
    ...(environment === undefined ? {} : { environment }),
    ...(identity.jobs === undefined ? {} : { jobsProtocolVersion: identity.jobs.version }),
  };
}

/**
 * Compares every existing query and hydration isolation boundary.
 * @param left - Existing left-hand value.
 * @param right - Existing right-hand value.
 * @returns Whether every isolation field matches.
 */
export function sameScope(left: RelkitKeyScope, right: RelkitKeyScope): boolean {
  return (
    left.backend === right.backend &&
    left.applicationId === right.applicationId &&
    left.identityScope === right.identityScope &&
    left.sessionEpoch === right.sessionEpoch &&
    left.identityKey === right.identityKey &&
    left.publicFingerprint === right.publicFingerprint &&
    left.environment === right.environment &&
    left.jobsProtocolVersion === right.jobsProtocolVersion
  );
}
