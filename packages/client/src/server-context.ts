import type {
  CreateRelkitServerContextOptions,
  RelkitServerContext,
} from "./server-context.types.js";
import type { ClientIdentityDocument } from "@relkit/contracts";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { dehydrate } from "@tanstack/query-core";
import { createClient } from "./transport.js";
import { scopeFor } from "./react/context-support.js";
export type {
  CreateRelkitServerContextOptions,
  RelkitServerContext,
} from "./server-context.types.js";

/**
 * Forwards request identity into a server client and scope-bound hydration state.
 * @param options - Existing public configuration and authority.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function createRelkitServerContext(
  options: CreateRelkitServerContextOptions,
): Promise<RelkitServerContext> {
  const forwarded = forwardedHeaders(options.request);
  const identityResponse = await fetch(new URL("/_relkit/v1/client/identity", options.baseUrl), {
    headers: forwarded,
    cache: "no-store",
  });
  if (!identityResponse.ok) {
    throw new Error(`Relkit identity request failed (${identityResponse.status})`);
  }
  const identity = (await identityResponse.json()) as ClientIdentityDocument;
  forwarded.set("x-relkit-identity-scope", identity.identityScope);
  forwarded.set("x-relkit-session-epoch", identity.sessionEpoch);
  if (identity.jobs !== undefined) {
    forwarded.set("x-relkit-jobs-protocol", String(identity.jobs.version));
    forwarded.set("x-relkit-public-fingerprint", identity.publicFingerprint);
  }
  const client = createClient({ baseUrl: options.baseUrl, headers: forwarded });
  const utils = createTanstackQueryUtils(client);
  const scope = scopeFor(options.baseUrl, identity, options.identityKey);
  return {
    client,
    utils,
    identity,
    dehydrate: () => ({ scope, dehydrated: dehydrate(options.queryClient) }),
  };
}

/**
 * Copies only the existing request headers allowed at the server-client boundary.
 * @param request - Existing request and authorization authority.
 * @returns A fresh header collection containing only permitted request headers.
 */
function forwardedHeaders(request: Request): Headers {
  const result = new Headers();
  for (const name of ["cookie", "authorization", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}
