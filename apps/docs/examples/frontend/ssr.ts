/** Prefetches Hello for one Bun-rendered request using the same identity-scoped key as the React hook. */
import { createRelkitServerContext } from "@relkit/client/server/tanstack-query";
import { relkitKey } from "@relkit/client/react";
import { QueryClient } from "@tanstack/query-core";

/** Prepares a private hydration snapshot without sharing credentials or cache across requests.
 * @param request - Current incoming request whose credentials may be forwarded.
 * @param baseUrl - The same public backend origin configured on the browser provider.
 * @returns Identity-bound state for RelkitClientProvider's hydratedState prop. */
export async function prefetchGreeting(request: Request, baseUrl: string) {
  const queryClient = new QueryClient();
  try {
    const server = await createRelkitServerContext({ baseUrl, request, queryClient });
    const input = { name: "RELKIT" };
    const scope = server.dehydrate().scope;
    await queryClient.prefetchQuery({
      queryKey: relkitKey(scope, "query", "GET /hello", input),
      queryFn: () => server.client["route.get.hello"](input),
      staleTime: 30_000,
    });
    return server.dehydrate();
  } finally {
    queryClient.clear();
  }
}
