/**
 * Static help, completion and generated-reference metadata for `relkit mcp`.
 * The parser in cli-command-mcp.ts reads these option names; nothing here
 * discovers sessions or starts the server.
 */
import { command } from "./cli-help-builders.js";
import { projectRoot } from "./cli-help-options.js";

/** Serves the running development session to coding agents over MCP stdio. */
export const mcpHelp = command(
  "mcp",
  "Serve the running development session to coding agents over MCP (stdio)",
  "relkit mcp",
  { options: [projectRoot] },
);
