import type {
  AgentNode,
  ApplicationGraph,
  ChannelNode,
  ClientRoute,
} from "./generate-registry-support-calculations.types.js";
import { Effect } from "effect";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Renders count or member presence from channel metadata.
 * @param value - Serialized presence declaration.
 * @returns An Effect yielding a presence type; it has no expected failure.
 * @example Effect.runSync(presenceTypeEffect("count"));
 */
export const presenceTypeEffect = Effect.fnUntraced(function* (value: unknown) {
  if (value === "count") return 'import("@relkit/client/react").CountPresence';
  const record = yield* recordCalculation(value);
  return record?.member === undefined
    ? "never"
    : `import("@relkit/client/react").MemberPresence<${yield* schemaCalculations.typeEffect(record.member)}>`;
});
/** Renders channel events, parameters, and presence from a document.
 * @param channel - Serialized channel metadata.
 * @returns An Effect yielding a channel contract type; it has no expected failure.
 * @example Effect.runSync(channelDocumentTypeCore({ events: {}, params: {} }));
 */
export const channelDocumentTypeCore = Effect.fnUntraced(function* (
  channel: Record<string, unknown>,
) {
  const events: string[] = [];
  const declared = yield* recordCalculation(channel.events);
  for (const [name, schema] of Object.entries(declared ?? {}))
    events.push(`${JSON.stringify(name)}: ${yield* schemaCalculations.typeEffect(schema)}`);
  const params = yield* schemaCalculations.typeEffect(channel.params);
  const presence = yield* presenceTypeEffect(channel.presence);
  return `import("@relkit/client/react").ClientChannelContract<${params}, { ${events.join("; ")} }, ${presence}>`;
});
/** Retains only non-array records from an unknown list.
 * @param value - Unknown document list.
 * @returns An Effect yielding records in input order; it has no expected failure.
 * @example Effect.runSync(arrayRecordsCore([{}, null]));
 */
export const arrayRecordsCore = Effect.fnUntraced(function* (value: unknown) {
  const records: Record<string, unknown>[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const record = yield* recordCalculation(item);
    if (record !== undefined) records.push(record);
  }
  return records;
});
/** Selects graph channels exposed to generated clients.
 * @param graph - Application graph to inspect.
 * @returns An Effect yielding public channels; it has no expected failure.
 * @example Effect.runSync(publicChannelsCore(graph));
 */
export const publicChannelsCore = Effect.fnUntraced(function* (graph: ApplicationGraph) {
  const channels: ChannelNode[] = [];
  for (const node of graph.nodes)
    if (node.kind === "channel" && node.client !== "internal") channels.push(node);
  return channels;
});
/** Selects graph agents exposed to generated clients.
 * @param graph - Application graph to inspect.
 * @returns An Effect yielding public agents; it has no expected failure.
 * @example Effect.runSync(publicAgentsCore(graph));
 */
export const publicAgentsCore = Effect.fnUntraced(function* (graph: ApplicationGraph) {
  const agents: AgentNode[] = [];
  for (const node of graph.nodes)
    if (node.kind === "agent" && node.client !== undefined) agents.push(node);
  return agents;
});
/** Formats the method and path selector for an HTTP route.
 * @param route - Resolved public route.
 * @returns An Effect yielding its selector; it has no expected failure.
 * @example Effect.runSync(selectorCore(route));
 */
export const selectorCore = Effect.fnUntraced(function* (route: ClientRoute) {
  return `${route.trigger.config.method} ${route.trigger.config.path}`;
});
