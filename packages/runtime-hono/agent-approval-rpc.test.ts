import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAgent, type PendingApproval } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { createOperationId } from "@relkit/realtime";
import { z } from "@relkit/schema";
import { createClient } from "@relkit/client";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { waitForAgentRun } from "./src/agent-run-tasks.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("approval interruption admits one continuation without replaying agent execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-approval-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
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
  const plan = approvalPlan();
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
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine,
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
  const accepted = await client["relkit.agent.run"]({
    agentId: agent.id,
    threadId: "conversation:approval",
    operationId: createOperationId(),
    kind: "run",
    payload: "cancel order",
  });
  const interrupted = await waitForStatus(
    client,
    agent.id,
    accepted.threadId,
    "approval-interrupted",
  );
  expect(interrupted.approvals).toHaveLength(2);
  expect(interrupted.currentMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "tool",
        parts: [expect.objectContaining({ kind: "progress", value: { stage: "waiting" } })],
      }),
    ]),
  );
  const approvalIds = interrupted.approvals.map(
    (approval: { approvalId: string }) => approval.approvalId,
  );
  const operationId = createOperationId();
  const control = {
    agentId: agent.id,
    threadId: accepted.threadId,
    operationId,
    kind: "approve",
    payload: { decisions: Object.fromEntries(approvalIds.map((id: string) => [id, "approve"])) },
  };
  const receipts = await Promise.all([
    client["relkit.agent.control"](control),
    client["relkit.agent.control"](control),
  ]);
  expect(receipts.map((receipt) => receipt.duplicate).sort()).toEqual([false, true]);
  const settled = await waitForStatus(client, agent.id, accepted.threadId, "idle");
  expect(executions).toBe(1);
  expect(settled.currentRuns).toMatchObject([
    { runId: accepted.runId, status: "approval-interrupted" },
    { status: "succeeded" },
  ]);
  expect(settled.approvals).toMatchObject([
    { approvalId: approvalIds[0], status: "approved" },
    { approvalId: approvalIds[1], status: "approved" },
  ]);
  expect(settled.controls).toMatchObject([
    { controlId: operationId, status: "applied", effect: "confirmed" },
  ]);
  await waitForAgentRun(accepted.runId);
});

async function waitForStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === status) return snapshot;
    await Bun.sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

function approvalPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:agent",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    agents: [
      {
        kind: "agent",
        id: "support.approval",
        source: { file: "agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.support.approval.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
        controls: ["approve"],
      },
    ],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.approval": agent },
    middleware: {},
    requestTransforms: {},
  };
}
