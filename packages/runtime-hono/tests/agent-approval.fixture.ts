/** Acquires the native approval provider, agent, progress-emitting engine and HTTP client. Its shared lifetime fixture joins accepted runs before removing temporary state. */
import type { PendingApproval } from "@relkit/agents";
import { defineAgent } from "@relkit/langchain";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { z } from "@relkit/schema";
import { createApp } from "../src/index.ts";
import { trackFixtureRun, trackFixtureProvider } from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { agentRpcRoot } from "./agent-rpc-support.fixture.js";
import { approvalPlan, manifest } from "./agent-approval-plan.fixture.js";

/** Defines the original approval-enabled string agent.
 * @returns The original descriptor allowing approval controls.
 */
function approvalAgent() {
  const agent = defineAgent({
    id: "support.approval",
    input: z.string(),
    output: z.string(),
    instructions: "Require approval.",
    tools: [],
    limits: { maxSteps: 1, maxToolCalls: 1, timeoutMs: 2_000 },
    stateProfile: "default",
    client: { authorize: () => true },
    chat: { input: "message", output: "answer" },
    controls: ["approve"],
  });
  return agent;
}

/** Emits progress and requests both approvals while counting actual engine invocations.
 * @returns The original progress/approval engine and its live invocation count.
 */
function approvalEngine() {
  let executions = 0;
  const engine = {
    invoke: async (request: { readonly trigger?: unknown }) => {
      executions += 1;
      const trigger = request.trigger as {
        approval?: (value: PendingApproval) => Promise<string>;
        progressSink?: { emit(value: unknown, signal: AbortSignal): Promise<void> };
      };
      await trigger.progressSink!.emit({ stage: "waiting" }, new AbortController().signal);
      const approval = trigger.approval;
      return Promise.all(
        ["tool-call-1", "tool-call-2"].map((toolCallId) =>
          approval!({
            invocationId: "invocation-1",
            toolCallId,
            toolId: "orders.cancel",
            sideEffect: "write",
            policy: "always",
            required: true,
            state: "pending",
          }),
        ),
      ).then((decisions) => decisions.join(","));
    },
  };
  return {
    engine,
    get executions() {
      return executions;
    },
  };
}

/** Acquires the provider and client around the unchanged approval engine.
 * @returns The native approval client, descriptor and live invocation count.
 */
export async function createApprovalFixture() {
  const root = await agentRpcRoot("relkit-agent-approval-");
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const agent = approvalAgent();
  const plan = approvalPlan();
  const native = approvalEngine();
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
  return {
    agent,
    client,
    get executions() {
      return native.executions;
    },
  };
}
