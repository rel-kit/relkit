import type { AgentNode, ChannelNode, ClientRoute } from "./generate-registry-types.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { agentContractCalculations } from "./generate-agent-contract-types.js";
import { schemaCalculations } from "./generate-schema.js";
import { recordCalculation } from "./generate-schema-render.js";
/** Renders a React client contract type for a channel.
 * @param channel - Public channel node.
 * @returns An Effect yielding its events and presence type; it has no expected failure.
 * @example Effect.runSync(channelRegistryTypeEffect(channel));
 */
function channelRegistryTypeCore(channel: ChannelNode): Effect.Effect<string> {
  return Effect.gen(function* () {
    const events: string[] = [];
    for (const [name, value] of Object.entries(channel.events).sort(([left], [right]) =>
      left.localeCompare(right),
    ))
      events.push(`${JSON.stringify(name)}: ${yield* schemaCalculations.typeEffect(value)}`);
    const record = yield* recordCalculation(channel.presence);
    const presence =
      channel.presence === "count"
        ? 'import("@relkit/client/react").CountPresence'
        : record !== undefined && record.member !== undefined
          ? `import("@relkit/client/react").MemberPresence<${yield* schemaCalculations.typeEffect(record.member)}>`
          : "never";
    const params = yield* schemaCalculations.typeEffect(channel.params);
    return `import("@relkit/client/react").ClientChannelContract<${params}, { ${events.join("; ")} }, ${presence}>`;
  });
}
/** Renders a React client contract type for an agent.
 * @param agent - Public agent node.
 * @returns An Effect yielding the agent contract; it has no expected failure.
 * @example Effect.runSync(agentRegistryTypeEffect(agent));
 */
function agentRegistryTypeCore(agent: AgentNode): Effect.Effect<string> {
  return agentContractCalculations.type(agent);
}
/** Renders a React client contract type for an HTTP route.
 * @param route - Resolved public route.
 * @returns An Effect yielding query or stream behavior; it has no expected failure.
 * @example Effect.runSync(registryTypeEffect(route));
 */
function registryTypeCore(route: ClientRoute): Effect.Effect<string> {
  return Effect.gen(function* () {
    const input = yield* schemaCalculations.typeEffect(route.target.input);
    const errors: string[] = [];
    for (const entry of route.responses)
      if (entry.kind === "error") errors.push(yield* schemaCalculations.typeEffect(entry.schema));
    const error = errors.length === 0 ? "Error" : errors.join(" | ");
    const operation =
      route.trigger.config.client === false
        ? "query"
        : (route.trigger.config.client?.operation ?? "query");
    const output = yield* recordCalculation(route.target.output);
    if (output?.kind === "stream") {
      return `import("@relkit/client/react").ClientStreamContract<${input}, ${yield* schemaCalculations.typeEffect(output.item)}, ${error}> & { readonly operation: ${JSON.stringify(operation)} }`;
    }
    return `import("@relkit/client/react").ClientRouteContract<${input}, ${yield* schemaCalculations.typeEffect(route.target.output)}, ${error}> & { readonly operation: ${JSON.stringify(operation)} }`;
  });
}
const channelRegistryTypeOperation = makeGeneratorOperation(
  "channelRegistryType",
  channelRegistryTypeCore,
);
/** Renders a channel's event and presence type for the React registry.
 * @param channel - Public channel metadata.
 * @returns An Effect with a TypeScript type expression and no expected failures.
 * @example Effect.runSync(channelRegistryTypeEffect(channel));
 */
export const channelRegistryTypeEffect = channelRegistryTypeOperation.effect;
/** Renders channelRegistryType synchronously for existing callers.
 * @param channel - Public channel metadata.
 * @returns A TypeScript type expression.
 * @throws If malformed trusted input causes a defect.
 * @example channelRegistryType(channel);
 */
export const channelRegistryType = channelRegistryTypeOperation.run;
const agentRegistryTypeOperation = makeGeneratorOperation(
  "agentRegistryType",
  agentRegistryTypeCore,
);
/** Renders an agent's React client contract type.
 * @param agent - Public agent metadata.
 * @returns An Effect with a TypeScript type expression and no expected failures.
 * @example Effect.runSync(agentRegistryTypeEffect(agent));
 */
export const agentRegistryTypeEffect = agentRegistryTypeOperation.effect;
/** Renders agentRegistryType synchronously for existing callers.
 * @param agent - Public agent metadata.
 * @returns A TypeScript type expression.
 * @throws If malformed trusted input causes a defect.
 * @example agentRegistryType(agent);
 */
export const agentRegistryType = agentRegistryTypeOperation.run;
const registryTypeOperation = makeGeneratorOperation("registryType", registryTypeCore);
/** Renders a route's query or stream contract type for the React registry.
 * @param route - Public route metadata.
 * @returns An Effect with a TypeScript type expression and no expected failures.
 * @example Effect.runSync(registryTypeEffect(route));
 */
export const registryTypeEffect = registryTypeOperation.effect;
/** Renders registryType synchronously for existing callers.
 * @param route - Public route metadata.
 * @returns A TypeScript type expression.
 * @throws If malformed trusted input causes a defect.
 * @example registryType(route);
 */
export const registryType = registryTypeOperation.run;
/** Registry type calculations, including an Effect for agent contracts. @internal */
export const registryTypeCalculations = {
  channel: channelRegistryTypeOperation.run,
  channelEffect: channelRegistryTypeCore,
  agent: agentRegistryTypeCore,
  route: registryTypeOperation.run,
  routeEffect: registryTypeCore,
} as const;
