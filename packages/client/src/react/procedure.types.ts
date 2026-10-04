import type { QueryKey } from "@tanstack/react-query";

/** Generated TanStack query/mutation options and keys resolved by exact selector. */
export interface ProcedureUtilsLike {
  queryOptions(options: object): object;
  infiniteOptions(options: object): object;
  mutationOptions(options?: object): object;
  queryKey(options?: object): QueryKey;
  infiniteKey(options?: object): QueryKey;
  mutationKey(options?: object): QueryKey;
}
