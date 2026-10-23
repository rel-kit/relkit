/** Owns the checked AG-UI protocol fixture and joins all accepted runs before deleting its temporary provider state. */
import { trackFixtureRun, trackFixtureProvider, joinFixtureRuns } from "./fixture-lifetime.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineAgent } from "@relkit/langchain";
import type { RegistrationPlan } from "@relkit/graph";
import { z } from "@relkit/schema";
import { createLocalAgentStateProvider } from "@relkit/providers-local";
import type { RuntimeManifest } from "../src/index.js";
import { createAgUiApp as createApp } from "./optional-app-fixture.js";
import { runtimeCohort } from "./test-cohort.js";
const roots: string[] = [];
/** Joins accepted runs before removing this test's provider files.
 * @returns Completion after fixture-owned state is released.
 */
export async function disposeBasicFixtures() {
  await joinFixtureRuns();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
}
/** Creates the native selected AG-UI app with the original origin and identity policy.
 * @returns Application and an execution-count reader for admission assertions.
 */
export async function basicProtocolFixture() {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-protocol-"));
  roots.push(root);
  const provider = trackFixtureProvider(createLocalAgentStateProvider(root, { pollingMs: 50 }));
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
      track: trackFixtureRun,
      applicationId: "fixture",
      environment: "test",
      generationId: "generation-a",
      publicFingerprint: "sha256:public",
      provider: () => provider,
    },
  });
  return { app, executions: () => executions };
}
/** Builds the original public echo-agent graph cohort.
 * @returns Checked registration plan matching the fixture's runtime manifest.
 */
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
        generatedFunction: {
          functionId: "relkit.agent.support.echo.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "support.echo",
        },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
      },
    ],
    middlewares: [],
  };
}

/** Retains the descriptor under its original stable graph identity.
 * @param plan - Graph cohort whose fingerprint is embedded in runtime metadata.
 * @param agent - Real authoring descriptor retained by the runtime manifest.
 * @returns Matching manifest without evaluating agent execution.
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
