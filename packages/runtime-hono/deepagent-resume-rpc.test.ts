import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySaver } from "@langchain/langgraph";
import { createClient } from "@relkit/client";
import { defineAgent, invokeAgent, validateNativeAgentResumeInput } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createHitlTestModel, createNativeStringTool } from "./deepagent-test-model.ts";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("persists and resumes native DeepAgents human input without exposing native IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-deep-resume-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
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
  const plan = agentPlan();
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
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
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const client = createClient<any>({
    baseUrl: "http://relkit.test",
    headers: { "x-relkit-identity-scope": "viewer", "x-relkit-session-epoch": "session" },
    fetch: (request, init) => app.fetch(new Request(request, init)),
  });
  const threadId = "review:42";
  await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { message: "write" },
  });
  const waiting = await waitForStatus(client, agent.id, threadId, "waiting");
  expect(effects).toBe(0);
  expect(waiting.waiting.requests[0]).toMatchObject({
    value: {
      actionRequests: [{ name: "danger", args: { value: "approved" } }],
      reviewConfigs: [{ actionName: "danger", allowedDecisions: ["approve", "edit", "reject"] }],
    },
    response: { type: "object", required: ["decisions"] },
  });
  expect(waiting.waiting.requests[0]).not.toHaveProperty("id");
  expect(JSON.stringify(waiting.waiting)).not.toContain("__interrupt__");
  expect(
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "approve" }],
    }),
  ).toEqual({ decisions: [{ type: "approve" }] });
  expect(() =>
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "edit", editedAction: { name: "danger", args: {} } }],
    }),
  ).toThrow("arguments are invalid");
  expect(() =>
    validateNativeAgentResumeInput(waiting.waiting.requests, {
      decisions: [{ type: "edit", editedAction: { name: "other", args: { value: "x" } } }],
    }),
  ).toThrow("edited action is invalid");
  await resume(client, agent.id, threadId, waiting.waiting.revision, {
    decisions: [{ type: "approve" }],
  });
  const finished = await waitForStatus(client, agent.id, threadId, "idle");
  expect(effects).toBe(1);
  expect(finished.currentRuns).toMatchObject([{ status: "waiting" }, { status: "succeeded" }]);
  expect(finished.currentMessages.at(-1)?.parts[0]).toMatchObject({
    kind: "text",
    text: '{"answer":"finished"}',
    state: "complete",
  });
});

function resume(
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

async function waitForStatus(client: any, agentId: string, threadId: string, status: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch {
      // The local fixture atomically replaces its state file while the worker journals.
    }
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

function agentPlan(): RegistrationPlan {
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
        generatedFunction: { functionId: "relkit.agent.deep.review.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
      },
    ],
  };
}
