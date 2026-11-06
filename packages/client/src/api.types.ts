import type { ClientRouteContract, ClientStreamContract } from "./index.types.js";

/** Any finite or streamed route contract. */
export type AnyRouteContract =
  | (ClientRouteContract<unknown, unknown, unknown> & { readonly operation: "query" | "mutation" })
  | (ClientStreamContract<unknown, unknown, unknown> & {
      readonly operation: "query" | "mutation";
    });

/**
 * One route in the generated `api` object.
 * @typeParam Contract - The route's input, output, error union and operation.
 * @example type GetOrder = typeof api.orders.getOrder;
 */
export interface ApiRoute<Contract extends AnyRouteContract = AnyRouteContract> {
  /** Path below the API root; read it with `apiRoutePath`. */
  readonly "~route": readonly string[];
  /** Type-only carrier of the route contract; always undefined at runtime. */
  readonly "~contract"?: Contract;
}

/** The contract an API route carries. */
export type RouteContractOf<Route> = Route extends ApiRoute<infer Contract> ? Contract : never;

/** The input an API route takes. */
export type RouteInput<Route> = RouteContractOf<Route>["input"];

/** The finite output an API route returns. */
export type RouteOutput<Route> = RouteContractOf<Route>["output"];

/** The item type a streamed API route yields. */
export type RouteItem<Route> =
  RouteContractOf<Route> extends { readonly item: infer Item } ? Item : never;

/** The error union an API route rejects with, keyed by `code`. */
export type RouteError<Route> = RouteContractOf<Route>["error"];

/** A finite query route. */
export type ApiQueryRoute = ApiRoute<
  ClientRouteContract<unknown, unknown, unknown> & { readonly operation: "query" }
>;

/** A finite mutation route. */
export type ApiMutationRoute = ApiRoute<
  ClientRouteContract<unknown, unknown, unknown> & { readonly operation: "mutation" }
>;

/** A streamed route. */
export type ApiStreamRoute = ApiRoute<
  ClientStreamContract<unknown, unknown, unknown> & { readonly operation: "query" | "mutation" }
>;

/** Per-call options for a bound API route. */
export interface ApiCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * The `api` tree with every route callable against one backend.
 * @typeParam Tree - The generated API shape.
 */
export type ApiClient<Tree> = {
  readonly [Key in keyof Tree]: Tree[Key] extends ApiRoute<infer Contract>
    ? Tree[Key] &
        ((input: Contract["input"], options?: ApiCallOptions) => Promise<Contract["output"]>)
    : ApiClient<Tree[Key]>;
};
