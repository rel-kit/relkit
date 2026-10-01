import type { ApplicationGraph, ClientRoute } from "./generate-public-manifest.types.js";
import { Effect } from "effect";
import { makeGraphOperation } from "./generator-graph-operation.js";
import { AGENT_PROTOCOL_CAPABILITY, CONTRACT_VERSION } from "@relkit/contracts";
import { JOBS_PROTOCOL, JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import { jobPathCalculations } from "./generate-job-paths.js";
import { jobProcedureCalculations } from "./generate-job-procedures.js";
import { registrySupportCalculations } from "./generate-registry-support.js";
/** Builds the client-safe manifest from routes, channels, agents, and jobs.
 * @param graph - Validated application graph.
 * @param routes - Resolved public routes.
 * @returns An Effect yielding the manifest; it has no expected failure.
 * @example Effect.runSync(manifestCalculations.buildEffect(graph, routes));
 */
function publicManifestCore(
  graph: ApplicationGraph,
  routes: readonly ClientRoute[],
): Effect.Effect<object> {
  return Effect.gen(function* () {
    const jobs = [];
    for (const source of yield* jobProcedureCalculations.graphSourcesEffect(graph))
      jobs.push(yield* jobPathCalculations.documentEffect(source));
    const routeEntries = [];
    for (const route of routes)
      routeEntries.push({
        routeId: route.trigger.id,
        selector: yield* registrySupportCalculations.selectorEffect(route),
        functionId: route.target.id,
        operation:
          route.trigger.config.client === false
            ? "query"
            : (route.trigger.config.client?.operation ?? "query"),
        stream:
          route.target.output !== null &&
          typeof route.target.output === "object" &&
          !Array.isArray(route.target.output) &&
          (route.target.output as Record<string, unknown>).kind === "stream",
      });
    const channels = yield* registrySupportCalculations.channelsEffect(graph);
    const agents = yield* registrySupportCalculations.agentsEffect(graph);
    return {
      protocol: "relkit.client-manifest",
      version: CONTRACT_VERSION,
      capabilities: {
        agentStream: AGENT_PROTOCOL_CAPABILITY,
        ...(jobs.length === 0
          ? {}
          : { jobs: { protocol: JOBS_PROTOCOL, version: JOBS_PROTOCOL_VERSION } }),
      },
      routes: routeEntries,
      channels: channels.map((node) => ({
        id: node.id,
        client: node.client,
        params: node.params,
        events: node.events,
        presence: node.presence ?? null,
      })),
      agents: agents.map((node) => ({
        id: node.id,
        client: node.client,
        controls: node.controls ?? [],
        chat: node.chat ?? null,
        input: node.input,
        output: node.output,
        ...(node.workflow === undefined ? {} : { workflow: node.workflow }),
        ...(node.clientContract === undefined ? {} : { clientContract: node.clientContract }),
      })),
      ...(jobs.length === 0
        ? {}
        : { jobs, nameToId: Object.fromEntries(jobs.map((job) => [job.name, job.jobId])) }),
    };
  });
}
const publicManifestOperation = makeGraphOperation("publicManifest", publicManifestCore);
/** Builds the client-safe public manifest in an observed Effect.
 * @param graph - Application graph to inspect.
 * @returns An Effect with the generated value and MissingRouteTarget when an HTTP trigger references a missing function.
 * @example Effect.runSync(publicManifestEffect(graph));
 */
export const publicManifestEffect = publicManifestOperation.effect;
/** Builds the client-safe public manifest synchronously for existing callers.
 * @param graph - Application graph to inspect.
 * @returns The generated value.
 * @throws TypeError for a missing route target; otherwise a defect for malformed trusted input.
 * @example publicManifest(graph);
 */
export const publicManifest = publicManifestOperation.run;
/** Manifest calculation shared by composed graph operations. @internal */
export const manifestCalculations = {
  buildEffect: publicManifestCore,
} as const;
