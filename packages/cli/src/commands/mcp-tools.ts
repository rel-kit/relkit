/**
 * Defines the tools `relkit mcp` offers. Each tool wraps one Inspector API endpoint, the
 * session's record buffer, or a CLI command, and returns structured JSON an agent can act on.
 */
import { randomUUID } from "node:crypto";
import { API_BASE_PATH } from "relkit/contracts";
import { GRAPH_COLLECTIONS } from "relkit/inspector-api";
import { recentRequests, requestTrace, type McpRecordCollector } from "./mcp-records.js";
import type {
  McpProjectCommands,
  McpSession,
  McpToolDefinition,
  McpToolOutput,
} from "./mcp.types.js";

const OPTION_NAME = /^[a-z][a-z0-9-]{0,63}$/u;

/**
 * Builds every tool for one session.
 * @param session - Authenticated development session.
 * @param records - The session's record collector.
 * @param commands - `check` and `add` runners.
 * @returns Tools in a stable order.
 */
export function mcpTools(
  session: McpSession,
  records: McpRecordCollector,
  commands: McpProjectCommands,
): readonly McpToolDefinition[] {
  const api = (path: string, init?: RequestInit) => callApi(session, path, init);
  return [
    {
      name: "graph",
      title: "Query the application graph",
      description:
        "Read the application graph. Without arguments it returns the whole graph; with `collection` it lists one kind of entry (routes, functions, events, jobs, tools, ...); with `collection` and `id` it returns one entry with its edges.",
      inputSchema: object({
        collection: { type: "string", enum: [...GRAPH_COLLECTIONS] },
        id: { type: "string", minLength: 1 },
      }),
      readOnly: true,
      run: async ({ collection, id }) => {
        if (typeof collection !== "string")
          return id === undefined
            ? api(`${API_BASE_PATH}/graph`)
            : usage("`id` needs `collection`.");
        const base = `${API_BASE_PATH}/${encodeURIComponent(collection)}`;
        return api(typeof id === "string" ? `${base}/${encodeURIComponent(id)}` : base);
      },
    },
    {
      name: "diagnostics",
      title: "Read diagnostics",
      description:
        "Return the current generation's compiler and runtime diagnostics, each with its RELKIT_* code, message and source location.",
      inputSchema: object({}),
      readOnly: true,
      run: () => api(`${API_BASE_PATH}/diagnostics`),
    },
    {
      name: "requests",
      title: "List recent requests",
      description:
        "List the most recent HTTP requests the session handled, newest first, with request ID, trace ID, route, status and outcome. Set `failedOnly` to see failures only.",
      inputSchema: object({
        failedOnly: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      }),
      readOnly: true,
      run: async ({ failedOnly, limit }) => {
        await records.sync();
        const max = typeof limit === "number" ? limit : 20;
        return { value: { requests: recentRequests(records.records(), max, failedOnly === true) } };
      },
    },
    {
      name: "request_trace",
      title: "Read a request's logs and trace",
      description:
        "Return one request's record, its logs and the spans of its trace. Pass a request ID or a trace ID from the `requests` tool or an `x-request-id` response header.",
      inputSchema: object({ id: { type: "string", minLength: 1 } }, ["id"]),
      readOnly: true,
      run: async ({ id }) => {
        await records.sync();
        const trace = requestTrace(records.records(), String(id));
        if (trace.request === undefined && trace.logs.length === 0 && trace.spans.length === 0)
          return {
            isError: true,
            value: {
              code: "RELKIT_INSPECTOR_NOT_FOUND",
              message: `No request or trace "${String(id)}" is in the records collected since relkit mcp started.`,
            },
          };
        return { value: trace };
      },
    },
    {
      name: "invoke_function",
      title: "Invoke a function",
      description:
        "Run one function of the running application with the given input, through the same engine as a route. Returns the function's output or its declared error.",
      inputSchema: object({ functionId: { type: "string", minLength: 1 }, input: {} }, [
        "functionId",
      ]),
      readOnly: false,
      run: async ({ functionId, input }) => {
        const ready = await api(`${API_BASE_PATH}/health/ready`);
        if (ready.isError) return ready;
        const identity = ready.value as { generationId?: string; graphHash?: string };
        return api(
          `${API_BASE_PATH}/actions/functions/${encodeURIComponent(String(functionId))}/invoke`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              input: input ?? null,
              generationId: identity.generationId,
              graphHash: identity.graphHash,
              idempotencyKey: randomUUID(),
            }),
          },
        );
      },
    },
    {
      name: "check",
      title: "Run relkit check",
      description:
        "Compile and validate the project, like `relkit check`. Returns success or the diagnostics to fix.",
      inputSchema: object({}),
      readOnly: true,
      run: async () => commandOutput(await commands.check(session.root)),
    },
    {
      name: "add",
      title: "Add an artifact with relkit add",
      description:
        'Add a compile-ready artifact, like `relkit add <kind> [name]`. The change is one transaction: when any step fails, every file it touched is restored. `options` holds extra flags, for example { "service": "orders" } or { "no-install": true }.',
      inputSchema: object(
        {
          kind: { type: "string", pattern: OPTION_NAME.source },
          name: { type: "string", minLength: 1 },
          options: {
            type: "object",
            additionalProperties: { type: ["string", "boolean"] },
          },
        },
        ["kind"],
      ),
      readOnly: false,
      run: async ({ kind, name, options }) => {
        const args = addArguments(kind, name, options);
        if (typeof args === "string") return usage(args);
        return commandOutput(await commands.add(session.root, args));
      },
    },
  ];
}

/**
 * Turns `add` tool input into CLI arguments.
 * @returns Arguments, or a usage message for an invalid flag.
 */
export function addArguments(kind: unknown, name: unknown, options: unknown): string[] | string {
  if (typeof kind !== "string" || !OPTION_NAME.test(kind))
    return "`kind` must be an artifact kind.";
  const args = [kind, ...(typeof name === "string" ? [name] : [])];
  const entries = options !== null && typeof options === "object" ? Object.entries(options) : [];
  for (const [key, value] of entries) {
    if (!OPTION_NAME.test(key) || ["json", "project-root"].includes(key))
      return `Option "${key}" is not allowed.`;
    if (value === true) args.push(`--${key}`);
    else if (typeof value === "string") args.push(`--${key}`, value);
    else if (value !== false) return `Option "${key}" must be a string or a boolean.`;
  }
  return args;
}

/** Calls the Inspector API and keeps its JSON body as the tool value. */
async function callApi(
  session: McpSession,
  path: string,
  init?: RequestInit,
): Promise<McpToolOutput> {
  let response: Response;
  try {
    response = await session.request(path, init);
  } catch {
    return {
      isError: true,
      value: {
        code: "RELKIT_MCP_SESSION_LOST",
        message:
          "The development session stopped answering. Make sure relkit dev is running, then restart relkit mcp.",
      },
    };
  }
  const text = await response.text();
  let value: unknown = text;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    // Keep non-JSON bodies as text.
  }
  return response.ok
    ? { value }
    : { isError: true, value: { status: response.status, body: value } };
}

/** Keeps a command's exit status beside its output. */
function commandOutput(result: Awaited<ReturnType<McpProjectCommands["check"]>>): McpToolOutput {
  return {
    isError: result.exitCode !== 0,
    value: {
      exitCode: result.exitCode,
      output: result.output,
      ...(result.stderr.trim() === "" ? {} : { stderr: result.stderr.trim() }),
    },
  };
}

/** An argument error the agent can fix. */
function usage(message: string): McpToolOutput {
  return { isError: true, value: { code: "RELKIT_MCP_USAGE", message } };
}

/** A closed JSON Schema object. */
function object(properties: Record<string, unknown>, required: readonly string[] = []) {
  return {
    type: "object",
    properties,
    additionalProperties: false,
    ...(required.length === 0 ? {} : { required: [...required] }),
  };
}
