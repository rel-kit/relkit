/** Owns temporary graph state, native execution, and fixture request clients through suite cleanup. */
import { afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { type AgentStateProvider, type ExecutionClaim } from "@relkit/agents";
import { invokeAgent } from "@relkit/langchain";
import { type RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createApp, type RuntimeManifest } from "../src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import {
  faultProvider,
  captureClaims,
  type Phase,
  type ProviderMethod,
} from "./graph-boundary-faults.fixture.js";
import { reviewGraph, graphPlan } from "./graph-boundary-graph.fixture.js";

const roots: string[] = [];
afterAll(async () => {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

export async function createFixture(
  options: {
    saver?: MemorySaver;
    providerFault?: readonly [ProviderMethod, Phase];
    claims?: ExecutionClaim[];
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-graph-boundary-"));
  roots.push(root);
  const base = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  let provider = options.providerFault
    ? faultProvider(base, options.providerFault[0], options.providerFault[1])
    : base;
  if (options.claims !== undefined) provider = captureClaims(provider, options.claims);
  const entries = { review: 0, finish: 0 };
  const graph = reviewGraph(options.saver ?? new MemorySaver(), entries);
  return {
    root,
    graph,
    entries,
    provider: base,
    client: runtimeClient(graph, graphPlan(graph.workflow), provider, "generation-a"),
  };
}

export function runtimeClient(
  graph: ReturnType<typeof reviewGraph>,
  plan: RegistrationPlan,
  provider: AgentStateProvider,
  generationId: string,
  resumeFault?: Phase,
) {
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      agents: { [graph.id]: graph },
    } as RuntimeManifest,
    engine: boundaryEngine(graph, resumeFault),
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId,
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  return createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
}

function boundaryEngine(graph: ReturnType<typeof reviewGraph>, resumeFault?: Phase) {
  return {
    invoke: async (request: any) => {
      if (resumeFault === "before" && request.trigger.resume)
        throw new Error("resume engine before");
      const output = await invokeAgent({
        agent: graph,
        input: request.input,
        threadId: request.trigger.threadId,
        resume: request.trigger.resume,
        contentSink: request.trigger.contentSink,
        tools: {},
        engine: { invoke: () => Promise.reject(new Error("unused")) },
      });
      if (resumeFault === "after" && request.trigger.resume) throw new Error("resume engine after");
      return output;
    },
  };
}
