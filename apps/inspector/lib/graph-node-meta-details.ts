/** Readers for event, channel, tool, agent, error, environment and provider metadata. */
import type { GraphNode } from "./graph-model";
import { meta, number, record, strings, text } from "./graph-node-meta-values";

export function eventVersion(node: GraphNode): number | undefined {
  return number(meta(node).version);
}

export function eventPayload(node: GraphNode): unknown {
  return meta(node).input;
}

export function channelParams(node: GraphNode): unknown {
  return meta(node).params;
}

export function channelEvents(node: GraphNode): readonly { name: string; schema: unknown }[] {
  const events = record(meta(node).events);
  return events === undefined
    ? []
    : Object.entries(events).map(([name, schema]) => ({ name, schema }));
}

export function channelClient(node: GraphNode): string | undefined {
  return text(meta(node).client);
}

export function toolSideEffect(node: GraphNode): string | undefined {
  return text(meta(node).sideEffect);
}

export function toolApproval(node: GraphNode): string | undefined {
  return text(meta(node).approval);
}

export function agentModel(node: GraphNode): string | undefined {
  const value = meta(node);
  return text(value.model) ?? text(record(value.modelSource)?.kind) ?? text(value.modelSource);
}

export function agentToolIds(node: GraphNode): readonly string[] {
  return strings(meta(node).toolIds);
}

export function errorStatus(node: GraphNode): number | undefined {
  return number(record(meta(node).http)?.status);
}

export function errorRetry(node: GraphNode): string | undefined {
  return text(meta(node).retry);
}

export function envType(node: GraphNode): string | undefined {
  return text(meta(node).type);
}

export function envSensitive(node: GraphNode): boolean {
  return meta(node).sensitive === true;
}

export function envOptional(node: GraphNode): boolean {
  return meta(node).optional === true;
}

export function providerCapability(node: GraphNode): string | undefined {
  return text(meta(node).capability);
}

export function providerAdapter(node: GraphNode): string | undefined {
  const adapter = record(meta(node).adapter);
  return text(adapter?.adapterId) ?? text(adapter?.integrationId);
}
