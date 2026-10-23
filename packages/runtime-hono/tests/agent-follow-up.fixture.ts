/** Builds the reusable-thread follow-up fixture with one explicit first-segment completion barrier. Native state, engine input capture and tracked lifetime remain owned by the RPC test fixture. */
import { defineAgent } from "@relkit/langchain";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { z } from "@relkit/schema";
import { createApp } from "../src/index.ts";
import { trackFixtureRun, trackFixtureProvider } from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { agentPlan, manifest, agentRpcRoot } from "./agent-rpc-support.fixture.js";

/** Defines the original follow-up-enabled string agent.
 * @returns The original descriptor allowing queued follow-up controls.
 */
function followUpAgent() {
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    controls: ["follow-up"],
  });
  return agent;
}

/** Records segment inputs and holds only the first native invocation.
 * @param firstMayFinish - Explicit barrier delaying completion of only the first segment.
 * @returns The invocation engine and its ordered input record.
 */
function followUpEngine(firstMayFinish: Promise<void>) {
  const inputs: unknown[] = [];
  const engine = {
    invoke: async ({ input }: { readonly input: unknown }) => {
      inputs.push(input);
      if (inputs.length === 1) await firstMayFinish;
      return `reply:${String(input)}`;
    },
  };
  return { inputs, engine };
}

/** Acquires the provider, release barrier and HTTP client for queued follow-up acceptance.
 * @returns The native client, first-segment release operation and recorded inputs.
 */
export async function createFollowUpFixture() {
  const root = await agentRpcRoot("relkit-agent-follow-up-");
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const agent = followUpAgent();
  const plan = agentPlan();
  let release!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  const native = followUpEngine(firstMayFinish);
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine: native.engine,
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    agentRuntime: {
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const client = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: appFetch(app),
  });
  return { agent, client, release, inputs: native.inputs };
}
