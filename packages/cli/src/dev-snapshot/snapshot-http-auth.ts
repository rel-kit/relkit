/**
 * Projects current internal credentials only onto owned loopback protocol probes.
 * Tokens remain runtime values and never enter snapshots or diagnostics. Ordinary
 * application routes receive no injected authorization, including the hello probe.
 */
import { API_BASE_PATH } from "@relkit/contracts";

/**
 * Selects internal authentication without exposing it to application routes.
 * @param path - Exact pathname selected by the supervisor or readiness contract.
 * @param token - Current runtime credential, never persisted with the receipt.
 * @returns Fresh headers containing a bearer token only for reserved protocol paths.
 */
export function snapshotProbeHeaders(path: string, token: string | undefined): Headers {
  const headers = new Headers();
  if (token !== undefined && (path === API_BASE_PATH || path.startsWith(`${API_BASE_PATH}/`)))
    headers.set("authorization", `Bearer ${token}`);
  return headers;
}

/**
 * Adapts SDK verification fetch with current protected-endpoint credentials.
 * @param readToken - Current credential authority, evaluated only when fetching.
 * @returns Native fetch adapter; redirects cannot transfer injected credentials.
 */
export function makeSnapshotVerificationFetch(readToken: () => string | undefined): typeof fetch {
  /**
   * Performs one native SDK probe while retaining caller cancellation and headers.
   * @param input - SDK-owned URL; remote addresses receive no injected credentials.
   * @param init - Native request options whose explicit headers override Request headers.
   * @returns Joined native response under a no-redirect credential policy.
   */
  const verificationFetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (url.protocol === "http:" && url.hostname === "127.0.0.1")
      snapshotProbeHeaders(url.pathname, readToken()).forEach((value, key) =>
        headers.set(key, value),
      );
    return fetch(input, { ...init, headers, redirect: "error" });
  };
  return Object.assign(verificationFetch, { preconnect: fetch.preconnect });
}

/** Native Bun fetch signature retained for the supervisor's existing adapter seam. */
export const snapshotVerificationFetch = makeSnapshotVerificationFetch(
  () => process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN,
);
