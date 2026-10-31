/** Picks the declaration metadata the explorer shows from a raw API node. */

/** Declaration metadata the explorer may show; runtime state (values, todos, contracts) is excluded. */
const metaKeys = new Set([
  "description",
  "title",
  "tags",
  "source",
  "triggerType",
  "targetFunctionId",
  "config",
  "input",
  "output",
  "errors",
  "publishes",
  "dependencies",
  "invocationMode",
  "timeoutMs",
  "concurrency",
  "version",
  "profile",
  "capability",
  "functions",
  "events",
  "params",
  "client",
  "replay",
  "sideEffect",
  "approval",
  "mcp",
  "model",
  "modelSource",
  "toolIds",
  "limits",
  "http",
  "retry",
  "data",
  "type",
  "sensitive",
  "hasDefault",
  "optional",
  "requiredIn",
  "adapter",
  "ownership",
  "name",
  "eventId",
  "delivery",
  "schedule",
  "generated",
]);

/** Keeps the declaration fields the explorer describes a node with. */
export function nodeMeta(
  node: Record<string, unknown>,
): Readonly<Record<string, unknown>> | undefined {
  const entries = Object.entries(node).filter(
    ([key, value]) => metaKeys.has(key) && value !== undefined && value !== null,
  );
  return entries.length === 0 ? undefined : Object.freeze(Object.fromEntries(entries));
}
