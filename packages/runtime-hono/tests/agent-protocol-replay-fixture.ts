/** Owns native AG-UI replay fixtures and joins accepted execution before removing temporary provider state. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentExecutionEvent, type AgentStateProvider } from "@relkit/agents";
import { defineAgent } from "@relkit/langchain";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_VALUE,
  assertJsonValue,
  type JsonValue,
} from "@relkit/contracts";
import { z } from "@relkit/schema";
import type { RuntimeManifest, HttpEngine } from "../src/index.js";
import { createAgUiApp as createApp } from "./optional-app-fixture.js";
import { runtimeCohort } from "./test-cohort.js";
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import { agentProtocolReplayPlan as agentPlan } from "./agent-protocol-replay-plan.js";
const roots: string[] = [];

/** Joins accepted execution before removing owned provider state.
 * @returns Completion after every fixture root has been released.
 */
export async function disposeReplayFixtures() {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
}
const protocolBody = JSON.stringify({
  threadId: "protocol-thread",
  runId: "external-run",
  state: {},
  messages: [{ id: "message-1", role: "user", content: "hello" }],
  tools: [],
  context: [],
});
/** Attaches the original negotiated identity and stable operation key.
 * @param operationId - Caller-generated idempotency identity.
 * @returns Native AG-UI admission headers.
 */
function protocolHeaders(operationId: string) {
  return {
    "content-type": "application/json",
    "x-relkit-identity-scope": "viewer",
    "x-relkit-session-epoch": "session",
    "x-relkit-operation-id": operationId,
    [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
  };
}
/** Decodes SSE JSON without widening malformed external values.
 * @param text - Serialized native frame payload.
 * @returns Validated JSON retained for subsequent native SDK assertions.
 */
function parsedFrame(text: string): JsonValue {
  const value = JSON.parse(text);
  assertJsonValue(value);
  return value;
}
/** Acquires the original replay fixture with AG-UI explicitly selected.
 * @param invoke - Deterministic engine supplied by the scenario.
 * @param wrap - Provider wrapper used to expose lifecycle settlement to tests.
 * @returns Native application, request body and identity header factory.
 */
export async function protocolFixture(
  invoke: HttpEngine["invoke"],
  wrap: (provider: AgentStateProvider) => AgentStateProvider = (provider) => provider,
) {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-protocol-replay-"));
  roots.push(root);
  const agent = defineAgent({
    id: "support.echo",
    input: z.string(),
    output: z.string(),
    instructions: "Echo.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 1_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    chat: { input: "message", output: "answer" },
  });
  const plan = agentPlan();
  const provider = trackFixtureProvider(
    wrap(createLocalAgentStateProvider(root, { pollingMs: 50 })),
  );
  return {
    app: createApp({
      plan,
      manifest: manifest(plan, agent),
      engine: { invoke },
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
    }),
    url: "http://relkit.test/_relkit/v1/agents/support.echo/ag-ui",
    body: protocolBody,
    headers: protocolHeaders,
  };
}

export { canonicalEvents } from "./agent-protocol-event-fixture.js";

/** Splits native SSE records while retaining optional replay cursor identity.
 * @param text - Complete event stream body.
 * @returns Ordered validated JSON frames and their original cursors.
 */
export function parseSse(
  text: string,
): readonly { readonly id?: string; readonly data: JsonValue }[] {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
      if (data === undefined) throw new Error("SSE data is missing.");
      return { ...(id === undefined ? {} : { id }), data: parsedFrame(data) };
    });
}

/** Creates matching runtime metadata for the real fixture descriptor.
 * @param plan - Original replay graph cohort.
 * @param agent - Authoring descriptor retained without execution.
 * @returns Cohort-matched runtime manifest.
 */
function manifest(plan: RegistrationPlan, agent: object): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.echo": agent },
    middleware: {},
    requestTransforms: {},
  };
}
