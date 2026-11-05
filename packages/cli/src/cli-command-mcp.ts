/**
 * Parses `relkit mcp` flags into normalized invocation arguments. The dispatcher
 * hands them to commands/mcp.ts; parsing discovers no session and opens no stream.
 */
import { Effect } from "effect";
import { Command } from "effect/cli";
import {
  document,
  optionalString,
  optionArgs,
  type SelectInvocation,
} from "./cli-command-shared.js";

/**
 * Builds the MCP server command from its static help metadata.
 * @param select - Records the parsed invocation for the existing dispatcher.
 * @returns Pure parser syntax emitting a `--project-root` pair.
 */
export function mcpCommand(select: SelectInvocation) {
  const path = ["mcp"] as const;
  return document(
    Command.make("mcp", { projectRoot: optionalString(path, "project-root") }, (value) =>
      Effect.sync(() => select("mcp", [...optionArgs("project-root", value.projectRoot)])),
    ),
    path,
  );
}
