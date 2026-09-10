import type { AgentClientPolicy } from "./agent-client.js";
import {
  clientSchemaMetadata,
  dynamicClientSchema,
  mergeClientSchemas,
  selectedClientFields,
  type ClientSchemaMetadata,
  type ClientTypeField,
} from "./client-contract-schema.js";
import type { AgentMiddleware, AgentTool } from "./define-agent-native.js";
import type { GraphWorkflow } from "./graph-workflow.js";

export type ClientEventMetadata = ClientTypeField | { readonly kind: "dynamic" };
export type ClientToolMetadata =
  | {
      readonly id: string;
      readonly input: ClientSchemaMetadata;
      readonly output: ClientSchemaMetadata;
    }
  | { readonly kind: "dynamic" };
export interface ClientScopeMetadata {
  readonly kind: "agent" | "subagent" | "node" | "dynamic";
  readonly id?: string;
}
export interface ClientWaitingMetadata {
  readonly scope: ClientScopeMetadata;
  readonly response: ClientSchemaMetadata;
}
export interface AgentClientContractMetadata {
  readonly tools: readonly ClientToolMetadata[];
  readonly state: readonly ClientTypeField[];
  readonly events: readonly ClientEventMetadata[];
  readonly scopes: readonly ClientScopeMetadata[];
  readonly waiting: readonly ClientWaitingMetadata[];
}

interface SubagentMetadataSource {
  readonly id: string;
  readonly subagents?: readonly SubagentMetadataSource[];
}

export function agentClientContractMetadata(options: {
  readonly id: string;
  readonly tools: readonly AgentTool[];
  readonly middleware: readonly AgentMiddleware[];
  readonly client?: AgentClientPolicy;
  readonly subagents?: readonly SubagentMetadataSource[];
  readonly interruptOn?: Readonly<Record<string, unknown>>;
}): AgentClientContractMetadata {
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

export function graphClientContractMetadata(options: {
  readonly id: string;
  readonly state: { readonly getJsonSchema: () => unknown };
  readonly client?: AgentClientPolicy;
  readonly workflow: GraphWorkflow;
}): AgentClientContractMetadata {
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
