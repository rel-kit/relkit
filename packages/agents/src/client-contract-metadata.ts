import type { AgentClientPolicy } from "./agent-client.js";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  clientSchemaMetadata,
  dynamicClientSchema,
  mergeClientSchemas,
  selectedClientFields,
  type ClientSchemaMetadata,
  type ClientTypeField,
} from "./client-contract-schema.js";
import { agentDefinitionFailure } from "./define-agent-error.js";
import { graphDefinitionFailure } from "./define-graph-error.js";
import type { GraphWorkflow } from "./graph-workflow.js";
import type {
  AgentClientContractMetadata, AgentClientMetadataOptions, ClientEventMetadata,
  ClientScopeMetadata, ClientToolMetadata, ClientWaitingMetadata,
  GraphClientMetadataOptions, SubagentMetadataSource,
} from "./client-contract-metadata.types.js";

export type * from "./client-contract-metadata.types.js";

/** Builds client contract metadata for a native agent.
 * @param options - Agent tools, middleware, public policy, and nested agents.
 * @returns An Effect with metadata or AgentDefinitionFailure.
 * @example Effect.runSync(agentClientContractMetadataEffect(options));
 */
export const agentClientContractMetadataEffect = Effect.fn("Agents.client.agentMetadata")((
  options: AgentClientMetadataOptions,
) => Effect.try({ try: () => agentClientContractMetadataCore(options), catch: agentDefinitionFailure }),
  (effect) => observeAgent("client.agent-metadata", effect));

/** Builds native agent metadata for existing synchronous callers.
 * @param options - Agent tools, middleware, public policy, and nested agents.
 * @returns Frozen client contract metadata.
 * @throws The original invalid metadata error.
 * @example agentClientContractMetadata(options);
 */
export function agentClientContractMetadata(options: AgentClientMetadataOptions): AgentClientContractMetadata {
  return Effect.runSync(agentClientContractMetadataEffect(options).pipe(
    Effect.catchTag("AgentDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function agentClientContractMetadataCore(options: AgentClientMetadataOptions): AgentClientContractMetadata {
  const stateSchema = mergeClientSchemas(options.middleware.map((item) => item.stateSchema));
  const scopes: ClientScopeMetadata[] = [{ kind: "agent", id: options.id }];
  collectSubagents(options.subagents, scopes);
  scopes.push({ kind: "dynamic" });
  return Object.freeze({
    tools: toolMetadata([...options.tools, ...options.middleware.flatMap((item) => item.tools)]),
    state: selectedClientFields(stateSchema, options.client?.state),
    events: eventFields(options.client),
    scopes: Object.freeze(scopes),
    waiting: (options.interruptOn === undefined
      ? Object.freeze([])
      : Object.freeze([
          { scope: { kind: "dynamic" as const }, response: dynamicClientSchema },
        ])) as readonly ClientWaitingMetadata[],
  });
}

/** Builds client contract metadata for a native graph.
 * @param options - Graph state, workflow, and public policy.
 * @returns An Effect with metadata or GraphDefinitionFailure.
 * @example Effect.runSync(graphClientContractMetadataEffect(options));
 */
export const graphClientContractMetadataEffect = Effect.fn("Agents.client.graphMetadata")((
  options: GraphClientMetadataOptions,
) => Effect.try({ try: () => graphClientContractMetadataCore(options), catch: graphDefinitionFailure }),
  (effect) => observeAgent("client.graph-metadata", effect));

/** Builds graph metadata for existing synchronous callers.
 * @param options - Graph state, workflow, and public policy.
 * @returns Frozen client contract metadata.
 * @throws The original invalid graph metadata error.
 * @example graphClientContractMetadata(options);
 */
export function graphClientContractMetadata(options: GraphClientMetadataOptions): AgentClientContractMetadata {
  return Effect.runSync(graphClientContractMetadataEffect(options).pipe(
    Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function graphClientContractMetadataCore(options: GraphClientMetadataOptions): AgentClientContractMetadata {
  const scopes: ClientScopeMetadata[] = [{ kind: "agent", id: options.id }];
  const waiting: ClientWaitingMetadata[] = [];
  collectWorkflow(options.workflow, scopes, waiting);
  return Object.freeze({
    tools: Object.freeze([]),
    state: selectedClientFields(
      clientSchemaMetadata(options.state.getJsonSchema()),
      options.client?.state,
    ),
    events: eventFields(options.client),
    scopes: Object.freeze(scopes),
    waiting: Object.freeze(waiting),
  });
}

function collectSubagents(
  subagents: readonly SubagentMetadataSource[] | undefined,
  scopes: ClientScopeMetadata[],
): void {
  for (const subagent of subagents ?? []) {
    scopes.push({ kind: "subagent", id: subagent.id });
    collectSubagents(subagent.subagents, scopes);
  }
}

function collectWorkflow(
  workflow: GraphWorkflow,
  scopes: ClientScopeMetadata[],
  waiting: ClientWaitingMetadata[],
): void {
  for (const node of workflow.nodes) {
    const scope = { kind: "node" as const, id: node.id };
    scopes.push(scope);
    if (node.resume !== undefined) waiting.push({ scope, response: node.resume });
    if (node.workflow !== undefined) collectWorkflow(node.workflow, scopes, waiting);
  }
}

function eventFields(client: AgentClientPolicy | undefined): readonly ClientEventMetadata[] {
  return Object.freeze(
    Object.entries(client?.events ?? {}).map(([name, value]) => ({
      name,
      schema: clientSchemaMetadata(value),
    })),
  );
}

function toolMetadata(values: readonly unknown[]): readonly ClientToolMetadata[] {
  const tools = new Map<string, ClientToolMetadata>();
  let hasDynamic = false;
  for (const value of values) {
    if (!isRecord(value)) {
      hasDynamic = true;
      continue;
    }
    const ref = isRecord(value.ref) && value.ref.kind === "tool" ? value.ref : undefined;
    const id =
      typeof ref?.id === "string"
        ? ref.id
        : typeof value.name === "string"
          ? value.name
          : undefined;
    if (id === undefined) {
      hasDynamic = true;
      continue;
    }
    if (tools.has(id)) continue;
    const target = isRecord(value.target) ? value.target : undefined;
    tools.set(id, {
      id,
      input: clientSchemaMetadata(target?.input ?? value.schema),
      output: clientSchemaMetadata(target?.output ?? value.outputSchema),
    });
  }
  return Object.freeze([...tools.values(), ...(hasDynamic ? [dynamicClientSchema] : [])]);
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
