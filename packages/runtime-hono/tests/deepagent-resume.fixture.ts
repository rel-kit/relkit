/** Owns native DeepAgents setup, temporary state cleanup, and public resume polling. */
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import { createFixtureClient, appFetch } from "./fixture-client.js";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";

import { defineAgent, invokeAgent } from "@relkit/langchain";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createHitlTestModel, createNativeStringTool } from "./deepagent-test-model.ts";
import { createApp, type RuntimeManifest } from "../src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

export async function createDeepFixture() {
  const root = await mkdtemp(join(tmpdir(), "relkit-deep-resume-"));
  roots.push(root);
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
  const fixture = deepReviewAgent();
  const { agent } = fixture;
  const plan = agentPlan();
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      agents: { [agent.id]: agent },
    } as RuntimeManifest,
    engine: {
      invoke: (request: any) =>
        invokeAgent({
          agent,
          input: request.input,
          threadId: request.trigger.threadId,
          resume: request.trigger.resume,
          contentSink: request.trigger.contentSink,
          tools: {},
          engine: { invoke: () => Promise.reject(new Error("unused")) },
        }),
    },
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
  return { agent, client, effects: fixture.effects };
}

function deepReviewAgent() {
  const model = createHitlTestModel();
  let effects = 0;
  const danger = createNativeStringTool("danger", async ({ value }) => {
    effects += 1;
    return value;
  });
  const agent = defineAgent({
    id: "deep.review",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model,
    instructions: "Call danger once, then finish.",
    tools: [danger],
    interruptOn: {
      danger: {
        allowedDecisions: ["approve", "edit", "reject"],
        description: "Review write",
        argsSchema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
    checkpointer: new MemorySaver(),
    limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 2_000 },
    stateProfile: "default",
    client: { authorize: () => true },
  });
  return { agent, effects: () => effects };
}

export function resume(
  client: any,
  agentId: string,
  threadId: string,
  waitingRevision: string,
  payload: unknown,
) {
  return client["relkit.agent.run"]({
    agentId,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    resume: true,
    waitingRevision,
    payload,
  });
}

export async function waitForStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch {
      // The local fixture atomically replaces its state file while the worker journals.
    }
    await sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

export function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:deep-resume",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    middlewares: [],
    agents: [
      {
        kind: "agent",
        id: "deep.review",
        source: { file: "agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: [],
        limits: {},
        generatedFunction: {
          functionId: "relkit.agent.deep.review.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "deep.review",
        },
        profile: "default",
        stateProfile: "default",
        client: "protected",
      },
    ],
  };
}
