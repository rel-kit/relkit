import {
  McpServer,
  createMcpHandler,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import type { Context, Hono } from "hono";
import type { ToolRegistration } from "@zsys/graph";
import { getRequestState } from "./middleware.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";

export interface McpOptions {
  readonly enabled?: boolean;
}

type RuntimeTool = {
  readonly target?: {
    readonly input?: StandardSchemaWithJSON;
    readonly output?: StandardSchemaWithJSON;
  };
  readonly onBefore?: (value: unknown, context: unknown) => unknown;
  readonly onAfter?: (value: unknown, context: unknown) => unknown;
};

export function installMcp(app: Hono, options: RouteMaterializationOptions): void {
  if (options.mcp?.enabled === false) return;
  app.all("/mcp", async (context) => handlerFor(context, options).fetch(context.req.raw));
}

function handlerFor(context: Context, options: RouteMaterializationOptions) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "zsys", version: "2" });
    const tools = options.plan.tools
      .filter((entry) => entry.mcp)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const tool of tools) {
      register(server, tool, context, options);
    }
    return server;
  });
}

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
    async (arguments_: unknown) => invoke(tool, runtime, arguments_, context, options),
  );
}

async function invoke(
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
  try {
    const value = await options.engine.invoke({
      functionId: tool.targetFunctionId,
      input,
      source: "tool",
      ...(state?.signal === undefined ? {} : { signal: state.signal }),
      ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
      ...(state?.requestId === undefined ? {} : { correlationId: state.requestId }),
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
  } catch (cause) {
    return failure(publicMessage(cause));
  }
}

function requiresApproval(tool: ToolRegistration): boolean {
  return (
    tool.approval === "always" ||
    (tool.approval === "on-write" && tool.sideEffect !== "none" && tool.sideEffect !== "read")
  );
}

function failure(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function publicMessage(cause: unknown): string {
  if (isRecord(cause) && typeof cause.code === "string") return cause.code;
  return "Tool invocation failed";
}
