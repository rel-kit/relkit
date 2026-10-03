import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import type { ToolRegistration } from "@relkit/graph";
import { Effect, Context as EffectContext, Layer, Result } from "effect";
import type { Context, Hono } from "hono";
import { observeHttp, runHttp } from "./http-effect.js";
import { HttpInvocation, httpInvocationLayer } from "./http-invocation.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import type { RuntimeTool } from "./mcp.types.js";
import { getRequestState } from "./middleware.js";
export type { McpOptions } from "./mcp.types.js";

/** Registers the configured MCP endpoint with the existing protocol handler.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; the requested update is applied to the owned state.
 */
export function installMcp(app: Hono, options: RouteMaterializationOptions): void {
  if (options.mcp?.enabled === false) return;
  app.all("/mcp", async (context) => handlerFor(context, options).fetch(context.req.raw));
}

/** Creates the per-request MCP server and registers exposed tools deterministically.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An MCP HTTP handler that creates a server exposing the declared MCP tools.
 */
function handlerFor(context: Context, options: RouteMaterializationOptions) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "relkit", version: "2" });
    const tools = options.plan.tools
      .filter((entry) => entry.mcp)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const tool of tools) {
      register(server, tool, context, options);
    }
    return server;
  });
}

/** Registers tool schemas, side-effect annotations and its invocation handler.
 * @param server - server supplied by the caller.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; the requested update is applied to the owned state.
 */
function register(
  server: McpServer,
  tool: ToolRegistration,
  context: Context,
  options: RouteMaterializationOptions,
): void {
  const runtime = getEntry(options.manifest.tools ?? {}, tool.id) as RuntimeTool | undefined;
  const input = runtime?.target?.input;
  const output = runtime?.target?.output;
  server.registerTool(
    tool.id,
    {
      description: tool.description,
      ...(input === undefined ? {} : { inputSchema: input }),
      ...(output === undefined ? {} : { outputSchema: output }),
      annotations: {
        readOnlyHint: tool.sideEffect === "none" || tool.sideEffect === "read",
        destructiveHint: tool.sideEffect === "write",
      },
    },
    (arguments_: unknown) =>
      runHttp(
        Effect.flatMap(McpTools, (tools) =>
          tools.invoke(tool, runtime, arguments_, context, options),
        ).pipe(Effect.provide(McpToolsLive)),
      ),
  );
}

/** Invokes an approved MCP tool and projects its result into public protocol content.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @param runtime - Configured runtime and provider dependencies.
 * @param input - Submitted operation input; validation and authorization occur before effects are admitted.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An Effect producing MCP text and optional structured content, or a sanitized tool failure.
 */
const invoke = Effect.fn("McpTools.invoke")(function* (
  tool: ToolRegistration,
  runtime: RuntimeTool | undefined,
  input: unknown,
  context: Context,
  options: RouteMaterializationOptions,
) {
  if (requiresApproval(tool)) {
    return failure(`Approval required for tool "${tool.id}"`);
  }
  const state = getRequestState(context);
  const result = yield* Effect.result(
    Effect.gen(function* () {
      const invocation = yield* HttpInvocation;
      const value = yield* invocation.invoke({
        functionId: tool.targetFunctionId,
        input,
        source: "tool",
        ...(state?.signal === undefined ? {} : { signal: state.signal }),
        ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
        ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
        ...(tool.timeoutMs === undefined ? {} : { timeoutMs: tool.timeoutMs }),
        ...(options.auth === undefined ? {} : { auth: options.auth.contextFor(context.req.raw) }),
        ...(runtime?.onBefore === undefined && runtime?.onAfter === undefined
          ? {}
          : {
              toolHooks: {
                ...(runtime.onBefore === undefined ? {} : { onBefore: runtime.onBefore }),
                ...(runtime.onAfter === undefined ? {} : { onAfter: runtime.onAfter }),
              },
            }),
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(value) }],
        ...(isRecord(value) ? { structuredContent: value } : {}),
      };
    }).pipe(Effect.provide(httpInvocationLayer(options.engine))),
  );
  return Result.isSuccess(result) ? result.success : failure(publicMessage(result.failure.cause));
});

/** MCP tool execution applies approval policy before invoking the shared engine service. */
export class McpTools extends EffectContext.Service<McpTools, { readonly invoke: typeof invoke }>()(
  "@relkit/runtime-hono/McpTools",
) {}

/** Live tool workflows preserve public failure sanitization and engine hook ordering. */
export const McpToolsLive = Layer.succeed(McpTools, {
  invoke: (...args) => observeHttp("mcp.invoke", invoke(...args)),
});

/** Evaluates declared tool approval policy before invoking application code.
 * @param tool - Declared tool or tool-call identity used for policy and attribution.
 * @returns Whether the value satisfies the required public contract.
 */
function requiresApproval(tool: ToolRegistration): boolean {
  return (
    tool.approval === "always" ||
    (tool.approval === "on-write" && tool.sideEffect !== "none" && tool.sideEffect !== "read")
  );
}

/** Creates a sanitized MCP tool failure response.
 * @param message - Public message included in the resulting value or failure.
 * @returns An MCP error result containing one public text item.
 */
function failure(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Projects a bounded public error code without exposing native exception details.
 * @param cause - Native failure projected without exposing private exception details.
 * @returns The public error code when available, otherwise the fixed tool-failure message.
 */
function publicMessage(cause: unknown): string {
  if (isRecord(cause) && typeof cause.code === "string") return cause.code;
  return "Tool invocation failed";
}
