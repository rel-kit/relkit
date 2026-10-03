import { os, type AnyProcedure } from "@orpc/server";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { SubscribeInput } from "./realtime-rpc-support.js";
import { observeRealtime, readRealtimePresence } from "./realtime-observation.js";

/** Materializes channel procedures over the scoped realtime service.
 * @param options - Channel providers and client identity configuration.
 * @returns The existing subscribe and presence procedures, or none when disabled.
 */
export function realtimeProcedures(
  options: RouteMaterializationOptions,
): Readonly<Record<string, AnyProcedure>> {
  if (options.realtime === undefined || options.clientIdentity === undefined) return {};
  return {
    "relkit.realtime.subscribe": os
      .$context<RpcContext>()
      .handler(({ input, context, signal }) =>
        observeRealtime(input as SubscribeInput, context, options, signal),
      ),
    "relkit.realtime.presence": os
      .$context<RpcContext>()
      .handler(({ input, context }) =>
        readRealtimePresence(input as SubscribeInput, context, options),
      ),
  };
}
