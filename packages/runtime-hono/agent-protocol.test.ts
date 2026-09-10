import { EventSchemas } from "@ag-ui/core";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAgent } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import { z } from "@relkit/schema";
import { AGENT_CAPABILITY_HEADER, AGENT_CAPABILITY_VALUE } from "@relkit/contracts";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import { createApp, type RuntimeManifest } from "./src/index.ts";
import { createOperationId } from "@relkit/realtime";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

test("AG-UI endpoint emits a parser-compatible stream", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-protocol-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
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
  let executions = 0;
  const app = createApp({
    plan,
    manifest: manifest(plan, agent),
    engine: {
      invoke: async ({ input }) => {
        executions += 1;
        return `reply:${String(input)}`;
      },
    },
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: () => ({ identityScope: "viewer", sessionEpoch: "session" }),
    },
    transportSecurity: { allowedOrigins: ["http://relkit.test"] },
    agentRuntime: {
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  const headers = {
    "content-type": "application/json",
    origin: "http://relkit.test",
    "x-relkit-identity-scope": "viewer",
    "x-relkit-session-epoch": "session",
    "x-relkit-operation-id": createOperationId(),
    [AGENT_CAPABILITY_HEADER]: AGENT_CAPABILITY_VALUE,
  };
  const aguiBody = JSON.stringify({
    threadId: "external-thread",
    runId: "external-run",
    state: {},
    messages: [{ id: "message-1", role: "user", content: "hello" }],
    tools: [],
    context: [],
  });
  expect(
    (
      await app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://relkit.test",
          "x-relkit-identity-scope": "viewer",
          "x-relkit-session-epoch": "session",
          "x-relkit-operation-id": createOperationId(),
        },
        body: aguiBody,
      })
    ).status,
  ).toBe(426);
  expect(executions).toBe(0);
  expect(
    (
      await app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
        method: "POST",
        headers: { ...headers, origin: "https://evil.example" },
        body: aguiBody,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
        method: "POST",
        headers: { ...headers, "x-relkit-session-epoch": "stale" },
        body: aguiBody,
      })
    ).status,
  ).toBe(409);
  expect(executions).toBe(0);
  const missingThread = JSON.stringify({
    ...JSON.parse(aguiBody),
    threadId: "",
  });
  expect(
    (
      await app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
        method: "POST",
        headers,
        body: missingThread,
      })
    ).status,
  ).toBe(422);
  expect(executions).toBe(0);
  const agui = await app.request("http://relkit.test/_relkit/v1/agents/support.echo/ag-ui", {
    method: "POST",
    headers,
    body: aguiBody,
  });
  expect(agui.status).toBe(200);
  expect(agui.headers.get(AGENT_CAPABILITY_HEADER)).toBe(AGENT_CAPABILITY_VALUE);
  const aguiText = await agui.clone().text();
  expect(aguiText).toContain("id: ");
  const aguiEvents = await events(agui);
  expect(aguiEvents[0]).toMatchObject({ threadId: "external-thread" });
  expect(aguiEvents.map((event) => EventSchemas.parse(event).type)).toEqual([
    "RUN_STARTED",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "RUN_FINISHED",
  ]);

  expect(executions).toBe(1);
});

async function events(response: Response): Promise<any[]> {
  return (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice(6)));
}

function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:agent-protocol",
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
        id: "support.echo",
        source: { file: "agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: [],
        limits: {},
        generatedFunction: { functionId: "relkit.agent.support.echo.invoke" },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
      },
    ],
    middlewares: [],
  };
}

function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.echo": agent },
    middleware: {},
    requestTransforms: {},
  };
}
