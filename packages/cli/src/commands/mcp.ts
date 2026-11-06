/**
 * Runs `relkit mcp`: a development-only MCP server on stdio for coding agents. It discovers the
 * project's running `relkit dev` session from `.relkit/connections`, calls the Inspector API with
 * that session's token, and stops when the client closes stdin. It lives in `@relkit/cli`, so no
 * production build contains it.
 */
import { resolve } from "node:path";
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Effect } from "effect";
import { InspectionFilesLive } from "relkit/inspector-api/connection";
import { observeCli } from "../cli-runtime.js";
import { fail, type CliCommandContext } from "../main-support.js";
import { discoverMcpSession } from "./mcp-session.js";
import { mcpProjectCommands } from "./mcp-project.js";
import { mcpRecordCollector } from "./mcp-records.js";
import { mcpTools } from "./mcp-tools.js";
import type { McpProjectCommands, McpSession, McpToolDefinition } from "./mcp.types.js";

/** Live discovery authority; acquiring it opens no files. */
export const mcpLiveLayer = InspectionFilesLive;

/**
 * Serves the session until the MCP client disconnects.
 * @param args - Normalized `--project-root` pair from the parser.
 * @param context - Invocation context supplying the working directory.
 * @returns Exit status 0 after the client closes the stream. Fails with `RELKIT_MCP_NO_SESSION`
 * when no session runs, before any MCP output.
 */
export const runMcpEffect = Effect.fn("Cli.mcp")(
  function* (args: readonly string[], context: CliCommandContext) {
    const root = resolve(context.cwd ?? process.cwd(), yield* projectRoot(args));
    const session = yield* discoverMcpSession(root);
    yield* Effect.callback<void>((resume) => {
      const transport = new StdioServerTransport();
      const server = createMcpServer(session, mcpProjectCommands);
      transport.onclose = () => resume(Effect.void);
      process.stdin.once("end", () => void server.close());
      void server.connect(transport);
      return Effect.promise(() => server.close());
    });
    return 0;
  },
  (effect) => observeCli("mcp.run", effect),
);

/**
 * Creates the MCP server for one session.
 * @param session - Authenticated development session.
 * @param commands - `check` and `add` runners.
 * @returns A server with every tool registered; connect it to any transport.
 */
export function createMcpServer(session: McpSession, commands: McpProjectCommands): McpServer {
  const server = new McpServer(
    { name: "relkit", version: "1" },
    {
      instructions:
        "Tools for the running RelKit development session: read the graph and diagnostics, read a request's logs and trace, invoke functions, run relkit check, and add artifacts with relkit add.",
    },
  );
  for (const tool of mcpTools(session, mcpRecordCollector(session), commands))
    register(server, tool);
  return server;
}

/** Registers one tool with its JSON Schema and annotations. */
function register(server: McpServer, tool: McpToolDefinition): void {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema as never),
      annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
    },
    async (input: unknown) => {
      const result = await tool.run((input ?? {}) as Readonly<Record<string, unknown>>);
      const value = result.value;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
        ...(value !== null && typeof value === "object" && !Array.isArray(value)
          ? { structuredContent: value as Record<string, unknown> }
          : {}),
        ...(result.isError ? { isError: true } : {}),
      };
    },
  );
}

/** Reads `--project-root`; any other flag is a usage error. */
const projectRoot = Effect.fn("Cli.mcp.args")(function* (args: readonly string[]) {
  let root = ".";
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name !== "--project-root" || value === undefined)
      return yield* Effect.fail(
        fail("RELKIT_MCP_USAGE", `${name ?? "argument"} is not a relkit mcp option.`, 2),
      );
    root = value;
  }
  return root;
});
