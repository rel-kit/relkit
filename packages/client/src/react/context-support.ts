import type { ClientIdentityDocument } from "@relkit/contracts";
import {
  createAutoClient,
  createClient,
  createWebSocketClient,
  type ClientHeaders,
} from "../index.js";
import type { RelkitKeyScope } from "./keys.js";
import { createAgentSseClient } from "./agent-sse-client.js";

export function browserOrigin(): string {
  return (
    (globalThis as { location?: { readonly origin: string } }).location?.origin ??
    "http://127.0.0.1:3000"
  );
}

export function isRelkitQuery(query: { readonly queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] === "relkit";
}

export function compiledFingerprint(): string | undefined {
  return (
    (globalThis as { __RELKIT_PUBLIC_FINGERPRINT__?: string }).__RELKIT_PUBLIC_FINGERPRINT__ ??
    (typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_RELKIT_PUBLIC_FINGERPRINT)
  );
}

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

export async function identityHeaders(
  value: ClientHeaders | undefined,
  identity: ClientIdentityDocument | undefined,
): Promise<Headers> {
  const resolved = typeof value === "function" ? await value() : value;
  const headers = new Headers(resolved as ConstructorParameters<typeof Headers>[0]);
  if (identity) {
    headers.set("x-relkit-identity-scope", identity.identityScope);
    headers.set("x-relkit-session-epoch", identity.sessionEpoch);
  }
  const csrf = browserCookie("relkit_csrf");
  if (csrf !== undefined && !headers.has("x-relkit-csrf")) {
    headers.set("x-relkit-csrf", csrf);
  }
  return headers;
}

function browserCookie(name: string): string | undefined {
  const cookie = (globalThis as { document?: { readonly cookie: string } }).document?.cookie;
  const value = cookie
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return value === undefined ? undefined : decodeURIComponent(value.slice(name.length + 1));
}

export function finiteFetcher(timeoutMs: number): typeof fetch {
  return ((input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  }) as typeof fetch;
}

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

export function scopeFor(
  backend: string,
  identity: ClientIdentityDocument,
  identityKey: string | null | undefined,
): RelkitKeyScope {
  return {
    backend,
    applicationId: identity.applicationId,
    identityScope: identity.identityScope,
    sessionEpoch: identity.sessionEpoch,
    identityKey,
    publicFingerprint: identity.publicFingerprint,
  };
}

export function sameScope(left: RelkitKeyScope, right: RelkitKeyScope): boolean {
  return (
    left.backend === right.backend &&
    left.applicationId === right.applicationId &&
    left.identityScope === right.identityScope &&
    left.sessionEpoch === right.sessionEpoch &&
    left.identityKey === right.identityKey &&
    left.publicFingerprint === right.publicFingerprint
  );
}
