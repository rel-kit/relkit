/**
 * Reexports oRPC's query adapter without adding it to the transport dependency
 * graph. Install @orpc/tanstack-query@2.0.0-beta.31 and @tanstack/query-core@^5
 * alongside @relkit/client when selecting this entrypoint.
 */
export { createTanstackQueryUtils } from "@orpc/tanstack-query";
export type { TanstackQueryOperationContext } from "@orpc/tanstack-query";
