/** Constructs two native generations sharing one provider while holding control reads behind an explicit barrier. Exposes the original retirement and cleanup observations without replaying the agent. */
import { defineAgent } from "@relkit/langchain";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { z } from "@relkit/schema";
import { createApp } from "../src/index.ts";
import {
  trackFixtureRun,
  trackFixtureProvider,
  awaitFixtureCancellation,
} from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { agentPlan, manifest, agentRpcRoot } from "./agent-rpc-support.fixture.js";

/** Holds native control reads until the explicit cleanup barrier is released.
 * @param root - Owned temporary directory backing the native state provider.
 * @returns The tracked native provider, release barriers and live control-settlement observation.
 */
function generationControls(root: string) {
  const nativeProvider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  const controlStarted = Promise.withResolvers<void>();
  const releaseControl = Promise.withResolvers<void>();
  let controlSettled = false;
  const provider = trackFixtureProvider({
    ...nativeProvider,
    readControls: async (request: Parameters<typeof nativeProvider.readControls>[0]) => {
      controlStarted.resolve();
      await releaseControl.promise;
      try {
        return await nativeProvider.readControls(request);
      } finally {
        controlSettled = true;
      }
    },
  });
  return {
    provider,
    controlStarted,
    releaseControl,
    get controlSettled() {
      return controlSettled;
    },
  };
}

/** Defines the original long-running generation-retirement agent.
 * @returns The original descriptor with its long-running invocation budget.
 */
function generationAgent() {
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 10_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    controls: ["approve"],
  });
  return agent;
}

/** Tracks each invocation and waits for the owning generation cancellation.
 * @returns The cancellation-held engine and its live execution count.
 */
function generationEngine() {
  let executions = 0;
  const engine = {
    invoke: async ({ signal }: { readonly signal?: AbortSignal }) => {
      executions += 1;
      await awaitFixtureCancellation(signal);
    },
  };
  return {
    engine,
    get executions() {
      return executions;
    },
  };
}

/** Tracks accepted tasks against a provider without changing generation signal ownership.
 * @param provider - Native state provider shared by the scenario generations.
 * @param acceptedRuns - Shared task promises joined when the generation is retired.
 * @returns A generation-specific runtime factory retaining every accepted task promise.
 */
function generationRuntime(
  provider: ReturnType<typeof generationControls>["provider"],
  acceptedRuns: Promise<void>[],
) {
  const runtime = (generationId: string, signal?: AbortSignal) => ({
    track: (task: Promise<void>) => {
      acceptedRuns.push(task);
      trackFixtureRun(task);
    },
    applicationId: "fixture",
    environment: "test",
    generationId,
    publicFingerprint: "sha256:public",
    ...(signal === undefined ? {} : { signal }),
    provider: () => provider,
  });
  return runtime;
}

/** Builds HTTP clients for the retiring and successor generations.
 * @param agent - Native agent descriptor installed in the scenario manifest.
 * @param engine - Original invocation implementation with live execution observations.
 * @param runtime - Factory attaching provider, generation identity and optional cancellation.
 * @param retired - Abort controller belonging only to the first generation.
 * @returns The original retiring-generation and successor HTTP clients.
 */
function generationClients(
  agent: ReturnType<typeof generationAgent>,
  engine: ReturnType<typeof generationEngine>["engine"],
  runtime: ReturnType<typeof generationRuntime>,
  retired: AbortController,
) {
  const plan = agentPlan();
  const identity = {
    applicationId: "fixture",
    publicFingerprint: "sha256:public",
    resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
  };
  const headers = { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" };
  const appA = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
    clientIdentity: identity,
    agentRuntime: runtime("generation-a", retired.signal),
  });
  const appB = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
    clientIdentity: identity,
    agentRuntime: runtime("generation-b"),
  });
  const clientA = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers,
    fetch: appFetch(appA),
  });
  const clientB = createFixtureClient({
    baseUrl: "http://relkit.test",
    headers,
    fetch: appFetch(appB),
  });
  return { clientA, clientB };
}

/** Acquires the shared provider, held engine and generation clients for retirement acceptance.
 * @returns Generation clients, abort/release barriers and live settlement observations.
 */
export async function createGenerationFixture() {
  const root = await agentRpcRoot("relkit-agent-generation-");
  const controls = generationControls(root);
  const agent = generationAgent();
  const retired = new AbortController();
  const acceptedRuns: Promise<void>[] = [];
  const native = generationEngine();
  const runtime = generationRuntime(controls.provider, acceptedRuns);
  const clients = generationClients(agent, native.engine, runtime, retired);
  return {
    ...clients,
    agent,
    retired,
    acceptedRuns,
    controlStarted: controls.controlStarted,
    releaseControl: controls.releaseControl,
    get controlSettled() {
      return controls.controlSettled;
    },
    get executions() {
      return native.executions;
    },
  };
}
