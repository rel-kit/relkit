import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";

/** mcp options configuring dependencies, callbacks and runtime policy. */
export interface McpOptions {
  readonly enabled?: boolean;
}

/** Contract for runtime tool used by mcp. */
export type RuntimeTool = {
  readonly target?: {
    readonly input?: StandardSchemaWithJSON;
    readonly output?: StandardSchemaWithJSON;
  };
  readonly onBefore?: (value: unknown, context: unknown) => unknown;
  readonly onAfter?: (value: unknown, context: unknown) => unknown;
};
