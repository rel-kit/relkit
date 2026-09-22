import type { AgentNode, ApplicationGraph, ChannelNode } from "@relkit/graph";
import { agentContractType } from "./generate-agent-contract-types.js";
import type { ClientRoute } from "./generate-types.js";
import { schemaType } from "./generate-schema.js";

export function channelDocumentType(channel: Record<string, unknown>): string {
  const events = isRecord(channel.events)
    ? Object.entries(channel.events)
        .map(([name, schema]) => `${JSON.stringify(name)}: ${schemaType(schema)}`)
        .join("; ")
    : "";
  return `import("@relkit/client/react").ClientChannelContract<${schemaType(channel.params)}, { ${events} }, ${presenceType(channel.presence)}>`;
}

export function agentDocumentType(agent: Record<string, unknown>): string {
  return agentContractType(agent);
}

export function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function publicChannels(graph: ApplicationGraph): readonly ChannelNode[] {
  return graph.nodes.filter(
    (node): node is ChannelNode => node.kind === "channel" && node.client !== "internal",
  );
}

export function publicAgents(graph: ApplicationGraph): readonly AgentNode[] {
  return graph.nodes.filter(
    (node): node is AgentNode => node.kind === "agent" && node.client !== undefined,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function selector(route: ClientRoute): string {
  return `${route.trigger.config.method} ${route.trigger.config.path}`;
}

function presenceType(value: unknown): string {
  return value === "count"
    ? 'import("@relkit/client/react").CountPresence'
    : isRecord(value) && value.member !== undefined
      ? `import("@relkit/client/react").MemberPresence<${schemaType(value.member)}>`
      : "never";
}
