/** Shared shapes for `relkit mcp`: the discovered session, its tools and the project commands. */
import type { InspectionDescriptor } from "relkit/inspector-api/connection";

/** A live, authenticated development session reached through its private bridge. */
export interface McpSession {
  /** Absolute application root the session belongs to. */
  readonly root: string;
  /** Private descriptor read from `.relkit/connections`; never sent to the MCP client. */
  readonly descriptor: InspectionDescriptor;
  /**
   * Calls one bridge or Inspector API path with the session token.
   * @param path - Absolute path such as `/_relkit/v1/graph`.
   * @param init - Fetch options; mutations get the current generation header.
   * @returns The bridge response.
   */
  readonly request: (path: string, init?: RequestInit) => Promise<Response>;
}

/** Result of one MCP tool call before it is turned into MCP content. */
export interface McpToolOutput {
  readonly value: unknown;
  readonly isError?: boolean;
}

/** One tool `relkit mcp` registers. */
export interface McpToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema of the tool's arguments. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** True when the tool only reads. */
  readonly readOnly: boolean;
  readonly run: (input: Readonly<Record<string, unknown>>) => Promise<McpToolOutput>;
}

/** Outcome of a CLI command run on the agent's behalf. */
export interface McpCommandResult {
  readonly exitCode: number;
  /** Parsed `--json` output when the command printed JSON, else its text. */
  readonly output: unknown;
  readonly stderr: string;
}

/** Runs `relkit check` and `relkit add` for the session's project. */
export interface McpProjectCommands {
  readonly check: (root: string) => Promise<McpCommandResult>;
  readonly add: (root: string, args: readonly string[]) => Promise<McpCommandResult>;
}
