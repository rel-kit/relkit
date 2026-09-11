import { ORPCError, os, type AnyProcedure, type ErrorMap, type Router } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context, Hono, Next } from "hono";
import type { HttpTriggerRegistration } from "@relkit/graph";
import type { MiddlewareContext } from "@relkit/routes";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import {
  createRpcMiddlewareContext,
  runRpcMiddleware as runTracedMiddleware,
} from "./rpc-middleware-trace.js";
import {
  assertExpectedIdentity,
  assertRpcSecurity,
  type RpcIdentityContext,
} from "./rpc-identity.js";
import { responseError, rpcError, rpcNotFound } from "./rpc-response.js";
import { realtimeProcedures } from "./realtime-rpc.js";
import { agentErrorStatuses, agentProcedures } from "./agent-rpc.js";
import {
  errorStatuses,
  isMiddleware,
  isSchema,
  routeOperation,
  rpcOutput,
  rpcOutputSchema,
} from "./rpc-route-types.js";
export interface RpcContext extends RpcIdentityContext {}
export function installRpc(app: Hono, options: RouteMaterializationOptions): void {
  const { router, errorStatusMap } = createRpcRouter(options);
  const handler = new RPCHandler<RpcContext>(router, { errorStatusMap });
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

export function createRpcRouter(options: RouteMaterializationOptions): {
  readonly router: Router<RpcContext>;
  readonly errorStatusMap: Readonly<Record<string, number>>;
} {
  const triggers = options.plan.httpTriggers.filter(
    (trigger) => trigger.config.rawHandler !== true && trigger.config.client !== false,
  );
  const errorStatusMap = {
    ...Object.fromEntries(triggers.flatMap((trigger) => errorStatuses(trigger))),
    ...agentErrorStatuses,
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
  } as Router<RpcContext>;
  return { router, errorStatusMap };
}
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
      const invoke = () =>
        options.engine.invoke({
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
  const run = async (index: number): Promise<unknown> => {
    if (index === ids.length) return invoke();
    const descriptor = getEntry(options.manifest.middleware, ids[index]!);
    if (!isMiddleware(descriptor)) return run(index + 1);
    let continued = false;
    let output: unknown;
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
