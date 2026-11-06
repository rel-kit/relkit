import type { Router } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context, Hono } from "hono";
import { FRAMEWORK_RPC_PATH } from "../contracts/client-api.js";
import { agentErrorStatuses, agentProcedures } from "./agent-rpc.js";
import { jobsErrorStatuses, jobsProcedures } from "./jobs/rpc.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { realtimeProcedures } from "./realtime-rpc.js";
import { errorStatusInterceptor } from "./rpc-handler-options.js";
import { rpcNotFound } from "./rpc-response.js";
import type { RpcContext } from "./rpc.types.js";
export type { RpcContext } from "./rpc.types.js";

/** Registers the framework's oRPC endpoint for channel, agent and job procedures. Routes are
 * not served here: the typed client calls them at their REST paths.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; mounts the RPC handler at `/_relkit/v1/rpc` and all descendant paths.
 */
export function installRpc(app: Hono, options: RouteMaterializationOptions): void {
  const { router, errorStatusMap } = createRpcRouter(options);
  const handler = new RPCHandler<RpcContext>(router, {
    clientInterceptors: [errorStatusInterceptor(errorStatusMap)],
  });
  /** Attach request authentication before dispatching through the installed oRPC router.
   * @param context - Incoming Hono context for the RPC endpoint.
   * @returns The matching RPC response, or the stable RPC not-found response.
   */
  const route = async (context: Context): Promise<Response> => {
    const auth = options.auth?.contextFor(context.req.raw);
    const result = await handler.handle(context.req.raw, {
      prefix: FRAMEWORK_RPC_PATH,
      context: { hono: context, auth },
    });
    return result.matched ? result.response : rpcNotFound();
  };
  app.all(FRAMEWORK_RPC_PATH, route);
  app.all(`${FRAMEWORK_RPC_PATH}/*`, route);
}

/** Builds the channel, agent and job procedures for the active generation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The combined procedure router and its public error-to-status mapping.
 */
export function createRpcRouter(options: RouteMaterializationOptions): {
  readonly router: Router<any, RpcContext>;
  readonly errorStatusMap: Readonly<Record<string, number>>;
} {
  const errorStatusMap = {
    ...agentErrorStatuses,
    ...jobsErrorStatuses,
    PROVIDER_STATE_LOST: 503,
    IDENTITY_PRECONDITION_FAILED: 409,
    IDEMPOTENCY_CONFLICT: 409,
    IDEMPOTENCY_WINDOW_EXPIRED: 409,
  };
  const router = {
    ...realtimeProcedures(options),
    ...agentProcedures(options),
    ...jobsProcedures(options),
  } as Router<any, RpcContext>;
  return { router, errorStatusMap };
}
