/** Codes reported by `relkit mcp` and the application's `/mcp` endpoint. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const mcpCodes = [
  {
    code: "RELKIT_MCP_APPROVAL_REQUIRED",
    title: "MCP tool needs approval",
    happened:
      "An MCP client called a tool whose `approval` policy requires a person to approve each call. The `/mcp` endpoint cannot ask for approval, so the tool did not run.",
    fix: 'Run the tool from an agent, which pauses for approval and lets you approve the call in the Inspector\'s tool page. If the tool is safe to run without review, set its `approval` to `"never"`.',
  },
  {
    code: "RELKIT_MCP_NO_SESSION",
    title: "No development session is running",
    happened:
      "`relkit mcp` found no running `relkit dev` session for this project with the Inspector bridge enabled, so it had nothing to connect to.",
    fix: "Run `relkit add inspector` once if the project does not enable the Inspector, start `relkit dev` in the project, then start `relkit mcp` again.",
  },
  {
    code: "RELKIT_MCP_SERVER_MISSING",
    title: "MCP server package is not installed",
    happened:
      "`relkit mcp` needs the `@modelcontextprotocol/server` package to speak the Model Context Protocol, and the project does not have it installed. The package is optional so that projects that never run `relkit mcp` do not carry it.",
    fix: "Add it to the project's development dependencies, for example `bun add -d @modelcontextprotocol/server`, then start `relkit mcp` again.",
  },
  {
    code: "RELKIT_MCP_SESSION_AMBIGUOUS",
    title: "More than one development session is running",
    happened:
      "`relkit mcp` found several running `relkit dev` sessions for this project and cannot choose one.",
    fix: "Stop the extra `relkit dev` processes so one session remains, then start `relkit mcp` again.",
  },
  {
    code: "RELKIT_MCP_SESSION_LOST",
    title: "Development session stopped answering",
    happened:
      "A `relkit mcp` tool could not reach the development session it connected to, often because `relkit dev` stopped or restarted.",
    fix: "Make sure `relkit dev` is running, then restart `relkit mcp` so it connects to the current session.",
  },
  {
    code: "RELKIT_MCP_USAGE",
    title: "Invalid relkit mcp arguments",
    happened: "`relkit mcp` received an option it does not accept or an option without a value.",
    fix: "Run `relkit mcp --help` for the accepted options, then run the command again.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
