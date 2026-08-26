import { ORPCError, os, type AnyProcedure, type ErrorMap, type Router } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Context, Hono, Next } from "hono";
import { normalizeFailure, toPublicEnvelope } from "@zsys/runtime-effect";
import type { HttpTriggerRegistration } from "@zsys/graph";
import type { MiddlewareContext, MiddlewareDescriptor } from "@zsys/routes";
import { getRequestState } from "./middleware.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
interface RpcContext {
  readonly hono: Context;
  readonly auth:
    ReturnType<NonNullable<RouteMaterializationOptions["auth"]>["contextFor"]> | undefined;
}
export function installRpc(app: Hono, options: RouteMaterializationOptions): void {
  const triggers = options.plan.httpTriggers.filter(
    (trigger) => trigger.config.rawHandler !== true,
  );
  const errorStatusMap = Object.fromEntries(triggers.flatMap((trigger) => errorStatuses(trigger)));
  const router = Object.fromEntries(
    triggers.flatMap((trigger) => {
      const value = procedure(trigger, options);
      return value === undefined ? [] : [[trigger.id, value]];
    }),
  ) as Router<RpcContext>;
  const handler = new RPCHandler<RpcContext>(router, { errorStatusMap });
  const route = async (context: Context): Promise<Response> => {
    const auth = options.auth?.contextFor(context.req.raw);
    const result = await handler.handle(context.req.raw, {
      prefix: "/rpc",
      context: { hono: context, auth },
    });
    return result.matched ? result.response : context.notFound();
  };
  app.all("/rpc", route);
  app.all("/rpc/*", route);
}
function procedure(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
): AnyProcedure | undefined {
  const target = getEntry(options.manifest.functions, trigger.targetFunctionId);
  if (!isRecord(target) || !isSchema(target.input) || !isSchema(target.output)) {
    return undefined;
  }
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
    .output(target.output)
    .handler(async ({ input, context, signal }) => {
      if (
        options.auth?.protects(trigger.config.path) &&
        (await context.auth?.getSession()) == null
      ) {
        throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
      }
      const invoke = () =>
        options.engine.invoke({
          functionId: trigger.targetFunctionId,
          input,
          source: "http",
          ...(signal === undefined ? {} : { signal }),
          ...(trigger.config.timeoutMs === undefined
            ? {}
            : { timeoutMs: trigger.config.timeoutMs }),
          ...(context.auth === undefined ? {} : { auth: context.auth }),
        });
      try {
        return await runMiddleware(trigger, context.hono, options, invoke);
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
    const response = await descriptor.handler(
      context,
      next,
      await middlewareContext(ids[index]!, context, options),
    );
    if (response instanceof Response) throw await responseError(response);
    if (!continued) throw new ORPCError("INTERNAL_SERVER_ERROR");
    return output;
  };
  return run(0);
}
async function middlewareContext(
  middlewareId: string,
  context: Context,
  options: RouteMaterializationOptions,
): Promise<MiddlewareContext> {
  const state = getRequestState(context);
  if (options.middlewareContext !== undefined) {
    return options.middlewareContext({
      middlewareId,
      signal: state?.signal ?? context.req.raw.signal,
      ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
      ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
    });
  }
  const noop = (): void => undefined;
  return {
    signal: context.req.raw.signal,
    env: {},
    log: { trace: noop, debug: noop, info: noop, warn: noop, error: noop },
    time: {
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  };
}
function rpcError(cause: unknown, signal: AbortSignal | undefined): ORPCError<string, unknown> {
  if (cause instanceof ORPCError) return cause;
  const failure = normalizeFailure(cause, signal === undefined ? {} : { signal });
  if (failure.kind === "application") {
    const envelope = toPublicEnvelope(failure);
    return envelope.data === undefined
      ? new ORPCError(failure.id, { message: failure.message })
      : new ORPCError(failure.id, { message: failure.message, data: envelope.data });
  }
  const code =
    failure.kind === "provider"
      ? "BAD_GATEWAY"
      : failure.kind === "timeout"
        ? "GATEWAY_TIMEOUT"
        : failure.kind === "cancellation"
          ? "CLIENT_CLOSED_REQUEST"
          : "INTERNAL_SERVER_ERROR";
  return new ORPCError(code);
}
async function responseError(response: Response): Promise<ORPCError<string, unknown>> {
  const code =
    response.status === 401
      ? "UNAUTHORIZED"
      : response.status === 429
        ? "TOO_MANY_REQUESTS"
        : "INTERNAL_SERVER_ERROR";
  return new ORPCError(code, {
    data: await response
      .clone()
      .json()
      .catch(() => undefined),
  });
}
function errorStatuses(trigger: HttpTriggerRegistration): [string, number][] {
  return Array.isArray(trigger.config.responses)
    ? trigger.config.responses.flatMap((entry) =>
        isRecord(entry) && typeof entry.errorId === "string" && typeof entry.status === "number"
          ? [[entry.errorId, entry.status]]
          : [],
      )
    : [];
}
function isSchema(value: unknown): value is import("@zsys/schema").StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}
function isMiddleware(value: unknown): value is MiddlewareDescriptor {
  return isRecord(value) && typeof value.handler === "function";
}
