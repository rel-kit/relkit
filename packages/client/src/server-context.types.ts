import type { ClientIdentityDocument } from "@relkit/contracts";
import type { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/query-core";
import type { createClient } from "./transport.js";
import type { RelkitHydrationState } from "./react/context.js";

/** Server request, backend and query-client configuration for one hydration context. */
export interface CreateRelkitServerContextOptions {
  readonly baseUrl: string;
  readonly request: Request;
  readonly queryClient: QueryClient;
  readonly identityKey?: string | null;
}

/** Typed finite client, TanStack utilities and dehydrated server query state. */
export interface RelkitServerContext {
  readonly client: ReturnType<typeof createClient>;
  readonly utils: ReturnType<typeof createTanstackQueryUtils>;
  readonly identity: ClientIdentityDocument;
  readonly dehydrate: () => RelkitHydrationState;
}
