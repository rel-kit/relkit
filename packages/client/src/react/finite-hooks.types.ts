import type { UseQueryOptions } from "@tanstack/react-query";
import type { ErrorFor, InputFor, OutputFor, QuerySelector } from "./registry.types.js";

/**
 * Declared route input or the existing skip-token readiness sentinel.
 * @typeParam Name - Declared registry key selecting the matching application contract.
 * @typeParam Selected - Selected query data exposed to subscribers.
 */
export type QueryInput<Name extends QuerySelector, Selected> = Omit<
  UseQueryOptions<OutputFor<Name>, ErrorFor<Name>, Selected>,
  "queryKey" | "queryFn"
> & { readonly input: InputFor<Name> };
