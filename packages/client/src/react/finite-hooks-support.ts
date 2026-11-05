import type { ApiMutationRoute, ApiQueryRoute } from "../api.types.js";
import { API_ROOT, apiRoutePath } from "../api.js";
import { normalizeClientError } from "../client-errors.js";
import { procedureUtils, type ProcedureUtilsLike } from "./procedure.js";

/**
 * Resolves the TanStack utilities and cache identity of one `api` route.
 * @param root - The provider's oRPC TanStack utilities.
 * @param route - A route from the generated `api` object.
 * @returns The route's utilities and its dotted name.
 */
export function routeUtils(
  root: unknown,
  route: ApiQueryRoute | ApiMutationRoute,
): { readonly utils: ProcedureUtilsLike; readonly name: string } {
  const path = apiRoutePath(route);
  return { utils: procedureUtils(root, [API_ROOT, ...path]), name: path.join(".") };
}

/**
 * Wraps a generated query function so every failure carries `code`, `status` and `data`.
 * @param generated - Options produced by the oRPC TanStack utilities.
 * @returns The options with a normalizing query function.
 */
export function normalizedQuery<Options extends object>(generated: Options): Options {
  const queryFn = (generated as { readonly queryFn?: unknown }).queryFn as
    ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (queryFn === undefined) return generated;
  return {
    ...generated,
    queryFn: async (...args: unknown[]) => {
      try {
        return await queryFn(...args);
      } catch (error) {
        throw normalizeClientError(error);
      }
    },
  };
}
