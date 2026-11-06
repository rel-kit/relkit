import type { Context } from "hono";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

/** Contract for rpc identity context used by rpc identity. */
export interface RpcIdentityContext {
  readonly hono: Context;
  readonly auth:
    ReturnType<NonNullable<RouteMaterializationOptions["auth"]>["contextFor"]> | undefined;
  readonly rpcHeaders?: Readonly<Record<string, string | string[] | undefined>>;
}
