/**
 * Projects generic RELKIT tool references and public event schemas into client metadata.
 * Native middleware, graph state and SDK schema projection remain in @relkit/langchain.
 */
import { Effect } from "effect";
import type { ToolRefAny } from "@relkit/tools";
import { observeAgent } from "./agent-telemetry.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import { clientSchemaMetadata } from "./client-contract-schema.js";
import type {
  AgentClientContractMetadata,
  AgentClientMetadataOptions,
  ClientToolMetadata,
} from "./client-contract-metadata.types.js";

export type * from "./client-contract-metadata.types.js";

/** Projects an ordinary agent's public contract without evaluating native schemas.
 * @param options - Generic tool references and client event policy.
 * @returns Frozen public metadata or AgentDefinitionFailure.
 */
export const agentClientContractMetadataEffect = Effect.fn("Agents.client.agentMetadata")(
  (options: AgentClientMetadataOptions) =>
    Effect.try({
      try: (): AgentClientContractMetadata =>
        Object.freeze({
          tools: Object.freeze(options.tools.map(toolMetadata)),
          state: Object.freeze([]),
          events: Object.freeze(
            Object.entries(options.client?.events ?? {}).map(([name, schema]) => ({
              name,
              schema: clientSchemaMetadata(schema),
            })),
          ),
          scopes: Object.freeze([
            { kind: "agent" as const, id: options.id },
            { kind: "dynamic" as const },
          ]),
          waiting: Object.freeze([]),
        }),
      catch: agentDefinitionFailure,
    }),
  (effect) => observeAgent("client.agent-metadata", effect),
);

/** Projects generic metadata for synchronous authoring.
 * @param options - Generic agent metadata sources.
 * @returns The public client contract.
 * @throws The original metadata projection error.
 */
export function agentClientContractMetadata(
  options: AgentClientMetadataOptions,
): AgentClientContractMetadata {
  return Effect.runSync(
    agentClientContractMetadataEffect(options).pipe(
      Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Reads optional schema data only when a reference also carries its authored descriptor.
 * @param tool - Stable RELKIT tool reference, optionally carrying target validators.
 * @returns Static tool identity with projected or explicitly dynamic schemas.
 */
function toolMetadata(tool: ToolRefAny): ClientToolMetadata {
  const target =
    "target" in tool && typeof tool.target === "object" && tool.target !== null
      ? tool.target
      : undefined;
  return {
    id: tool.ref.id,
    input: clientSchemaMetadata(
      target !== undefined && "input" in target ? target.input : undefined,
    ),
    output: clientSchemaMetadata(
      target !== undefined && "output" in target ? target.output : undefined,
    ),
  };
}
