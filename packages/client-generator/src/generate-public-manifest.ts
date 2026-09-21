import { AGENT_PROTOCOL_CAPABILITY, CONTRACT_VERSION } from "@relkit/contracts";
import { JOBS_PROTOCOL, JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import type { ApplicationGraph } from "@relkit/graph";
import { clientRoutes } from "./generate-types.js";
import { jobProcedureDocument, jobProcedureSources } from "./generate-job-procedures.js";
import { publicAgents, publicChannels, selector } from "./generate-registry-support.js";

export function publicManifest(graph: ApplicationGraph): object {
  const jobs = jobProcedureSources(graph).map(jobProcedureDocument);
  return {
    protocol: "relkit.client-manifest",
    version: CONTRACT_VERSION,
    capabilities: {
      agentStream: AGENT_PROTOCOL_CAPABILITY,
      ...(jobs.length === 0
        ? {}
        : { jobs: { protocol: JOBS_PROTOCOL, version: JOBS_PROTOCOL_VERSION } }),
    },
    routes: clientRoutes(graph).map((route) => ({
      routeId: route.trigger.id,
      selector: selector(route),
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
    })),
    channels: publicChannels(graph).map((node) => ({
      id: node.id,
      client: node.client,
      params: node.params,
      events: node.events,
      presence: node.presence ?? null,
    })),
    agents: publicAgents(graph).map((node) => ({
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
}
