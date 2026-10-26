/**
 * Describes server query hydration using query-core types alone. The React
 * provider accepts this structural hydration result without making its own
 * declarations part of the server integration's dependency graph.
 */
import type { ClientIdentityDocument } from "@relkit/contracts";
import type { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { DehydratedState, QueryClient } from "@tanstack/query-core";
import type { createClient } from "./transport.js";
import type { RelkitKeyScope } from "./react/keys.types.js";
import type { DefaultContract } from "./index.js";

/** Identity-bound query snapshot accepted by the React provider on hydration. */
export interface RelkitServerHydrationState {
  /** Backend, application and session authority attached to the cached data. */
  readonly scope: RelkitKeyScope;
  /** Native query-core snapshot, preserving query and mutation metadata. */
  readonly dehydrated: DehydratedState;
}

/** Server request, backend and query-client configuration for one hydration context. */
export interface CreateRelkitServerContextOptions {
  readonly baseUrl: string;
  readonly request: Request;
  readonly queryClient: QueryClient;
  readonly identityKey?: string | null;
}

/** Typed finite client, TanStack utilities and dehydrated server query state. */
export interface RelkitServerContext {
  readonly client: ReturnType<typeof createClient<DefaultContract>>;
  readonly utils: ReturnType<typeof createTanstackQueryUtils<RelkitServerContext["client"]>>;
  readonly identity: ClientIdentityDocument;
  readonly dehydrate: () => RelkitServerHydrationState;
}
