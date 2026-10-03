import {
  COMMON_ERROR_STATUS_MAP,
  ORPCError,
  os,
  type AnyProcedure,
  type ErrorMap,
  type Router,
} from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { HttpTriggerRegistration } from "@relkit/graph";
import type { Context, Hono, Next } from "hono";
import { agentErrorStatuses, agentProcedures } from "./agent-rpc.js";
import { invokeHttpEngine } from "./http-invocation.js";
import { jobsErrorStatuses, jobsProcedures } from "./jobs/rpc.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { realtimeProcedures } from "./realtime-rpc.js";
import { assertExpectedIdentity, assertRpcSecurity } from "./rpc-identity.js";
import {
  createRpcMiddlewareContext,
  runRpcMiddleware as runTracedMiddleware,
} from "./rpc-middleware-trace.js";
import { responseError, rpcError, rpcNotFound } from "./rpc-response.js";
import {
  errorStatuses,
  isMiddleware,
  isSchema,
  routeOperation,
  rpcOutput,
  rpcOutputSchema,
} from "./rpc-route-types.js";
import type { RpcContext } from "./rpc.types.js";
export type { RpcContext } from "./rpc.types.js";
/** Registers the existing HTTP oRPC transport over materialized procedures.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; mounts the RPC handler at the exact prefix and all descendant paths.
 */
export function installRpc(app: Hono, options: RouteMaterializationOptions): void {
  const { router, errorStatusMap } = createRpcRouter(options);
  const handler = new RPCHandler<RpcContext>(router, { errorStatusMap });
  /** Attach request authentication before dispatching through the installed oRPC router.
   * @param context - Incoming Hono context for the RPC endpoint.
   * @returns The matching RPC response, or the stable RPC not-found response.
   */
  const route = async (context: Context): Promise<Response> => {
    const auth = options.auth?.contextFor(context.req.raw);
    const result = await handler.handle(context.req.raw, {
      prefix: "/rpc",
      context: { hono: context, auth },
    });
    return result.matched ? result.response : rpcNotFound();
  };
  app.all("/rpc", route);
  app.all("/rpc/*", route);
}

/** Builds declared route, agent, realtime and job procedures for the active generation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The combined procedure router and its public error-to-status mapping.
 */
export function createRpcRouter(options: RouteMaterializationOptions): {
  readonly router: Router<RpcContext>;
  readonly errorStatusMap: Readonly<Record<string, number>>;
} {
  const triggers = options.plan.httpTriggers.filter(
    (trigger) => trigger.config.rawHandler !== true && trigger.config.client !== false,
  );
  const errorStatusMap = {
    ...COMMON_ERROR_STATUS_MAP,
    ...Object.fromEntries(triggers.flatMap((trigger) => errorStatuses(trigger))),
    ...agentErrorStatuses,
    ...jobsErrorStatuses,
    PROVIDER_STATE_LOST: 503,
    IDENTITY_PRECONDITION_FAILED: 409,
    IDEMPOTENCY_CONFLICT: 409,
    IDEMPOTENCY_WINDOW_EXPIRED: 409,
  };
  const router = {
    ...Object.fromEntries(
      triggers.flatMap((trigger) => {
        const value = procedure(trigger, options);
        return value === undefined
          ? []
          : [...new Set([trigger.id, `${trigger.config.method} ${trigger.config.path}`])].map(
              (name) => [name, value],
            );
      }),
    ),
    ...realtimeProcedures(options),
    ...agentProcedures(options),
    ...jobsProcedures(options),
  } as Router<RpcContext>;
  return { router, errorStatusMap };
}
/** Adapts one registered route to its oRPC procedure contract.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The typed oRPC procedure, or undefined when target schemas are unavailable.
 */
function procedure(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): AnyProcedure | undefined {
  const target =
    getEntry(options.manifest.targets ?? {}, trigger.targetFunctionId) ??
    getEntry(options.manifest.functions, trigger.targetFunctionId);
  if (!isRecord(target) || !isSchema(target.input) || !isSchema(target.output)) {
    return undefined;
  }
  const outputSchema = target.output;
  const errorMap = Object.fromEntries(
    (Array.isArray(target.errors) ? target.errors : []).flatMap((error) =>
      isRecord(error) && typeof error.id === "string"
        ? [
            [
              error.id,
              {
                ...(isSchema(error.data) ? { data: error.data } : {}),
                ...(typeof error.message === "string" ? { message: error.message } : {}),
              },
            ],
          ]
        : [],
    ),
  ) as ErrorMap;
  return os
    .$context<RpcContext>()
    .errors(errorMap)
    .input(target.input)
    .output(rpcOutputSchema(outputSchema))
    .handler(async ({ input, context, signal }) => {
      if (
        options.auth?.protects(trigger.config.path) &&
        (await context.auth?.getSession()) == null
      ) {
        throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
      }
      if (routeOperation(trigger) === "mutation" && options.clientIdentity !== undefined) {
        await assertExpectedIdentity(context, options.clientIdentity);
      }
      if (routeOperation(trigger) === "mutation" && options.transportSecurity !== undefined) {
        await assertRpcSecurity(context, options.transportSecurity);
      }
      /** Invoke the registered function with validated RPC input and inherited cancellation.
       * @returns The engine's native result Promise, including any lazy output stream.
       */
      const invoke = () =>
        invokeHttpEngine(options.engine, {
          functionId: trigger.targetFunctionId,
          input,
          source: "http",
          ...(signal === undefined ? {} : { signal }),
          ...(typeof trigger.config.timeoutMs === "number"
            ? { timeoutMs: trigger.config.timeoutMs }
            : {}),
          ...(context.auth === undefined ? {} : { auth: context.auth }),
        });
      try {
        return rpcOutput(outputSchema, await runMiddleware(trigger, context.hono, options, invoke));
      } catch (error) {
        throw rpcError(error, signal);
      }
    });
}
/** Preserves declared middleware onion order around an oRPC route invocation.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @param invoke - invoke supplied by the caller.
 * @returns The target result after middleware unwinds, or a public error for a rejected continuation.
 */
async function runMiddleware(
  trigger: HttpTriggerRegistration,
  context: Context,
  options: RouteMaterializationOptions,
  invoke: () => Promise<unknown>,
): Promise<unknown> {
  const ids = trigger.config.middleware
    .map((entry) => entry.id)
    .filter((id) => {
      const value = getEntry(options.manifest.middleware, id);
      return isRecord(value) && value.path !== "*";
    });
  /** Traverse declared middleware in onion order and invoke the target at the final index.
   * @param index - Next middleware position in the filtered declaration list.
   * @returns The downstream value; middleware responses and missing continuation become RPC errors.
   */
  const run = async (index: number): Promise<unknown> => {
    if (index === ids.length) return invoke();
    const descriptor = getEntry(options.manifest.middleware, ids[index]!);
    if (!isMiddleware(descriptor)) return run(index + 1);
    let continued = false;
    let output: unknown;
    /** Mark this middleware as continued and capture its downstream result.
     * @returns A Promise settling after the remaining middleware and target complete.
     */
    const next: Next = async () => {
      continued = true;
      output = await run(index + 1);
    };
    const middlewareId = ids[index]!;
    const response = await runTracedMiddleware(
      descriptor,
      middlewareId,
      context,
      next,
      createRpcMiddlewareContext(middlewareId, context, options),
    );
    if (response instanceof Response) throw await responseError(response);
    if (!continued) throw new ORPCError("INTERNAL_SERVER_ERROR");
    return output;
  };
  return run(0);
}
