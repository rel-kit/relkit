import type { ClientIdentityDocument } from "@relkit/contracts";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { dehydrate, type QueryClient } from "@tanstack/query-core";
import { createClient } from "./index.js";
import type { RelkitHydrationState } from "./react/context.js";
import { scopeFor } from "./react/context-support.js";

export interface CreateRelkitServerContextOptions {
  readonly baseUrl: string;
  readonly request: Request;
  readonly queryClient: QueryClient;
  readonly identityKey?: string | null;
}

export interface RelkitServerContext {
  readonly client: ReturnType<typeof createClient>;
  readonly utils: ReturnType<typeof createTanstackQueryUtils>;
  readonly identity: ClientIdentityDocument;
  readonly dehydrate: () => RelkitHydrationState;
}

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

function forwardedHeaders(request: Request): Headers {
  const result = new Headers();
  for (const name of ["cookie", "authorization", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}
