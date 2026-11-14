import { os, type AnyProcedure } from "@orpc/server";
import type { RpcContext } from "./rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { SubscribeInput } from "./realtime-rpc-support.js";
import { observeRealtime, readRealtimePresence } from "./realtime-observation.js";
import { assertExpectedIdentity } from "./rpc-identity.js";

/** Materializes channel procedures over the scoped realtime service.
 * @param options - Channel providers and client identity configuration.
 * @returns The existing subscribe and presence procedures, or none when disabled.
 */
export function realtimeProcedures(
  options: RouteMaterializationOptions,
): Readonly<Record<string, AnyProcedure>> {
  const clientIdentity = options.clientIdentity;
  if (options.realtime === undefined || clientIdentity === undefined) return {};
  return {
    // The identity precondition runs before the iterator is returned, so its declared
    // status applies; the stream rechecks it, with channel access, on every page.
    "relkit.realtime.subscribe": os
      .$context<RpcContext>()
      .handler(async ({ input, context, signal }) => {
        const subscription = input as SubscribeInput | undefined;
        await assertExpectedIdentity(context, clientIdentity, subscription?.expectedIdentity);
        return observeRealtime(input as SubscribeInput, context, options, signal);
      }),
    "relkit.realtime.presence": os
      .$context<RpcContext>()
      .handler(({ input, context }) =>
        readRealtimePresence(input as SubscribeInput, context, options),
      ),
  };
}
