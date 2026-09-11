import type { AgentClientContractMetadata } from "@relkit/graph";
import { agentResumeType } from "./generate-agent-resume.js";
import { schemaType } from "./generate-schema.js";

const dynamicType = 'import("@relkit/client/react").ClientAgentDynamic';

interface AgentContractSource {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly controls?: unknown;
  readonly chat?: unknown;
  readonly workflow?: unknown;
  readonly clientContract?: AgentClientContractMetadata;
}

export function agentContractType(agent: AgentContractSource): string {
  const controls = Array.isArray(agent.controls)
    ? agent.controls.map((control) => JSON.stringify(control)).join(" | ") || "never"
    : "never";
  const contract = agent.clientContract;
  return `import("@relkit/client/react").ClientAgentContract<${schemaType(agent.input)}, ${schemaType(agent.output)}, ${controls}, ${agent.chat === null || agent.chat === undefined ? "false" : "true"}, ${resumeType(contract, agent.workflow)}, ${toolType(contract)}, ${stateType(contract)}, ${eventType(contract)}, ${scopeType(contract)}, ${waitingType(contract)}>`;
}

function resumeType(contract: AgentClientContractMetadata | undefined, workflow: unknown): string {
  const types = contract?.waiting.map((entry) => metadataType(entry.response)) ?? [];
  if (types.length > 0) return union(types);
  return agentResumeType(workflow);
}

function toolType(contract: AgentClientContractMetadata | undefined): string {
  return union(
    (contract?.tools ?? []).map((tool) =>
      "kind" in tool
        ? dynamicType
        : `{ readonly kind: "tool"; readonly id: ${JSON.stringify(tool.id)}; readonly input: ${metadataType(tool.input)}; readonly output: ${metadataType(tool.output)} }`,
    ),
  );
}

function stateType(contract: AgentClientContractMetadata | undefined): string {
  const fields = (contract?.state ?? []).map(
    (field) =>
      `${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${metadataType(field.schema)}`,
  );
  return fields.length === 0
    ? "Readonly<Record<never, never>>"
    : `{ readonly ${fields.join("; readonly ")} }`;
}

function eventType(contract: AgentClientContractMetadata | undefined): string {
  const declared = (contract?.events ?? []).map((event) =>
    "kind" in event
      ? dynamicType
      : `{ readonly kind: "custom"; readonly name: ${JSON.stringify(event.name)}; readonly data: ${metadataType(event.schema)} }`,
  );
  return union(declared);
}

function scopeType(contract: AgentClientContractMetadata | undefined): string {
  return union((contract?.scopes ?? [{ kind: "dynamic" }]).map(scopeMember));
}

function waitingType(contract: AgentClientContractMetadata | undefined): string {
  return union(
    (contract?.waiting ?? []).map(
      (waiting) =>
        `{ readonly node: ${waiting.scope.kind === "dynamic" ? "string" : JSON.stringify(waiting.scope.id)}; readonly value?: unknown; readonly response: import("@relkit/contracts").JsonValue }`,
    ),
  );
}

function scopeMember(scope: { readonly kind: string; readonly id?: string }): string {
  return scope.kind === "dynamic"
    ? dynamicType
    : `{ readonly kind: ${JSON.stringify(scope.kind)}; readonly id: ${JSON.stringify(scope.id)} }`;
}

function metadataType(value: unknown): string {
  return isRecord(value) && value.kind === "dynamic" && Object.keys(value).length === 1
    ? dynamicType
    : schemaType(value);
}

function union(types: readonly string[]): string {
  return [...new Set(types)].sort().join(" | ") || "never";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
