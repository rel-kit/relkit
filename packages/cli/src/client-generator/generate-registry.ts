import type {
  ApplicationGraph,
  ClientRoute,
  InvalidClientContract,
} from "./generate-registry.types.js";
import { Effect } from "effect";
import { makeGeneratorOperation } from "./generator-operation.js";
import { makeGraphOperation } from "./generator-graph-operation.js";
import { registryTypeCalculations } from "./generate-registry-types.js";
import { schemaCalculations } from "./generate-schema.js";
import { jobProcedureCalculations } from "./generate-job-procedures.js";
import { jobRegistryCalculations } from "./generate-job-registry.js";
import { registrySupportCalculations } from "./generate-registry-support.js";
import { recordCalculation } from "./generate-schema-render.js";
export { InvalidClientContract } from "./generate-agent-contract-validation.js";
export { publicManifest, publicManifestEffect } from "./generate-public-manifest.js";
export {
  publicFingerprint,
  publicFingerprintEffect,
  generateClientManifest,
  generateClientManifestEffect,
  registryCalculations,
} from "./generate-registry-fingerprint.js";
/** Renders route, channel, agent, and job registry entries from a document.
 * @param document - Serialized public client document.
 * @returns An Effect yielding registry source or InvalidClientContract.
 * @example Effect.runSync(generateClientRegistryFromDocumentEffect({ procedures: [] }));
 */
function generateClientRegistryFromDocumentCore(
  document: Record<string, unknown>,
): Effect.Effect<string, InvalidClientContract> {
  return Effect.gen(function* () {
    const procedures = Array.isArray(document.procedures) ? document.procedures : [];
    const entries: string[] = [];
    for (const value of procedures) {
      const procedure = yield* recordCalculation(value);
      if (procedure === undefined || typeof procedure.name !== "string") continue;
      const route = (yield* recordCalculation(procedure.route)) ?? {};
      const output = (yield* recordCalculation(procedure.output)) ?? {};
      const stream = output.kind === "stream";
      const item = stream ? output.item : procedure.output;
      const operation = route.operation === "mutation" ? "mutation" : "query";
      const inputType = yield* schemaCalculations.typeEffect(procedure.input);
      const outputType = yield* schemaCalculations.typeEffect(item);
      const type = stream
        ? `import("@relkit/client/react").ClientStreamContract<${inputType}, ${outputType}, Error> & { readonly operation: ${JSON.stringify(operation)} }`
        : `import("@relkit/client/react").ClientRouteContract<${inputType}, ${outputType}, Error> & { readonly operation: ${JSON.stringify(operation)} }`;
      const selector = typeof procedure.selector === "string" ? [procedure.selector] : [];
      for (const name of new Set([procedure.name, ...selector]))
        entries.push(`    readonly ${JSON.stringify(name)}: ${type};`);
    }
    const channels: string[] = [];
    for (const channel of yield* registrySupportCalculations.recordsEffect(document.channels)) {
      if (typeof channel.id !== "string") continue;
      const type = yield* registrySupportCalculations.channelDocumentEffect(channel);
      channels.push(`    readonly ${JSON.stringify(channel.id)}: ${type};`);
    }
    const agents: string[] = [];
    for (const agent of yield* registrySupportCalculations.recordsEffect(document.agents)) {
      if (typeof agent.id !== "string") continue;
      const type = yield* registrySupportCalculations.agentDocument(agent);
      agents.push(`    readonly ${JSON.stringify(agent.id)}: ${type};`);
    }
    const jobs = Array.isArray(document.jobs) ? document.jobs : [];
    return [
      yield* registrySourceEffect(entries, channels, agents),
      ...(jobs.length === 0 ? [] : [yield* jobRegistryCalculations.documentEffect(jobs)]),
    ].join("");
  });
}
/** Renders registry entries from graph routes and public resources.
 * @param graph - Validated application graph.
 * @param routes - Resolved public routes.
 * @returns An Effect yielding registry source; it has no expected failure.
 * @example Effect.runSync(generateClientRegistryCore(graph, routes));
 */
function generateClientRegistryCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const entries: string[] = [];
    for (const route of routes) {
      const type = yield* registryTypeCalculations.routeEffect(route);
      const selector = yield* registrySupportCalculations.selectorEffect(route);
      for (const name of [...new Set([route.trigger.id, selector])].sort())
        entries.push(`    readonly ${JSON.stringify(name)}: ${type};`);
    }
    const channels: string[] = [];
    for (const channel of yield* registrySupportCalculations.channelsEffect(graph)) {
      const type = yield* registryTypeCalculations.channelEffect(channel);
      channels.push(`    readonly ${JSON.stringify(channel.id)}: ${type};`);
    }
    const agents: string[] = [];
    for (const agent of yield* registrySupportCalculations.agentsEffect(graph)) {
      const type = yield* registryTypeCalculations.agent(agent);
      agents.push(`    readonly ${JSON.stringify(agent.id)}: ${type};`);
    }
    const jobs = yield* jobProcedureCalculations.graphSourcesEffect(graph);
    return [
      yield* registrySourceEffect(entries, channels, agents),
      ...(jobs.length === 0 ? [] : [yield* jobRegistryCalculations.graphEffect(graph)]),
    ].join("");
  });
}
/** Assembles route, channel, and agent declarations into a React module augmentation.
 * @param entries - HTTP route declarations.
 * @param channels - Channel declarations.
 * @param agents - Agent declarations.
 * @returns An Effect yielding registry source; it has no expected failure.
 * @example Effect.runSync(registrySourceEffect([], [], []));
 */
const registrySourceEffect = Effect.fnUntraced(function* (
  entries: string[],
  channels: string[],
  agents: string[],
) {
  return [
    "/* generated by @relkit/client-generator; do not edit */",
    'declare module "@relkit/client/react" {',
    "  interface ClientRegistry {",
    ...entries,
    "  }",
    "  interface ChannelRegistry {",
    ...channels,
    "  }",
    "  interface AgentRegistry {",
    ...agents,
    "  }",
    "}",
    "export {};",
    "",
  ].join("\n");
});
const generateClientRegistryFromDocumentOperation = makeGeneratorOperation(
  "generateClientRegistryFromDocument",
  generateClientRegistryFromDocumentCore,
);
/** Renders client registry declarations from a document in an observed Effect.
 * @param document - Serialized client document.
 * @returns An Effect with the generated value or InvalidClientContract.
 * @example Effect.runSync(generateClientRegistryFromDocumentEffect(document));
 */
export const generateClientRegistryFromDocumentEffect =
  generateClientRegistryFromDocumentOperation.effect;
/** Renders client registry declarations from a document synchronously for existing callers.
 * @param document - Serialized client document.
 * @returns The generated value.
 * @throws InvalidClientContract for malformed agent client metadata.
 * @example generateClientRegistryFromDocument(document);
 */
export const generateClientRegistryFromDocument = generateClientRegistryFromDocumentOperation.run;
const generateClientRegistryOperation = makeGraphOperation(
  "generateClientRegistry",
  generateClientRegistryCore,
);
/** Renders graph-backed client registry declarations in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and MissingRouteTarget when an HTTP trigger references a missing function.
 * @example Effect.runSync(generateClientRegistryEffect(graph));
 */
export const generateClientRegistryEffect = generateClientRegistryOperation.effect;
/** Renders graph-backed client registry declarations synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example generateClientRegistry(graph);
 */
export const generateClientRegistry = generateClientRegistryOperation.run;
