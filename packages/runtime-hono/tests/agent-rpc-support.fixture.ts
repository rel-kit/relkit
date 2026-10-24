/** Owns temporary RPC state roots and Bun fixture servers, joining tracked runs before shutdown and directory removal. Shared plan/manifest and bounded polling preserve native scenario behavior. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach } from "vitest";
import type { RegistrationPlan } from "@relkit/graph";
import type { RuntimeManifest } from "../src/index.ts";
import { joinFixtureRuns } from "./fixture-lifetime.js";
import type { BunFixture } from "./bun-fixture.ts";
import { runtimeCohort } from "./test-cohort.ts";

const roots: string[] = [];
const servers: BunFixture[] = [];
afterEach(async () => {
  await joinFixtureRuns();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

/** Creates a native temporary state root retained until the scenario cleanup hook.
 * @param prefix - Original scenario-specific temporary-directory prefix.
 * @returns A tracked temporary directory removed after native runs and servers settle.
 */
export async function agentRpcRoot(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

/** Retains a started Bun transport server for cleanup after tracked runs settle.
 * @param server - Already-started native Bun fixture whose stop operation is retained.
 * @returns Nothing; the registered cleanup hook now owns server shutdown.
 */
export function retainAgentRpcServer(server: BunFixture) {
  servers.push(server);
}

/** Polls the durable thread until idle using the original bounded delay.
 * @param client - Public RPC client addressing the scenario's native application.
 * @param agentId - Registered agent identity selected by the scenario.
 * @param threadId - Durable conversation identity reused across RPC requests.
 * @returns The first idle snapshot, or a rejection after the original bounded polling window.
 */
export async function waitForIdle(client: any, agentId: string, threadId: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === "idle") return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Agent did not settle.");
}

/** Polls the durable thread for the requested terminal or interrupted status.
 * @param client - Public RPC client addressing the scenario's native application.
 * @param agentId - Registered agent identity selected by the scenario.
 * @param threadId - Durable conversation identity reused across RPC requests.
 * @param status - Exact persisted thread status required before returning.
 * @returns The matching snapshot, or a rejection after the original bounded polling window.
 */
export async function waitForThreadStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === status) return snapshot;
    await sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`);
}

/** Polls until an idle thread contains the expected number of durable segments.
 * @param client - Public RPC client addressing the scenario's native application.
 * @param agentId - Registered agent identity selected by the scenario.
 * @param threadId - Durable conversation identity reused across RPC requests.
 * @param count - Expected durable run segment count when the thread becomes idle.
 * @returns The idle snapshot with the expected segment count, or a bounded polling rejection.
 */
export async function waitForRunCount(
  client: any,
  agentId: string,
  threadId: string,
  count: number,
): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
    if (snapshot.thread.status === "idle" && snapshot.currentRuns.length === count) return snapshot;
    await sleep(10);
  }
  throw new Error(`Agent did not settle ${count} runs.`);
}

/** Constructs the unchanged echo-agent registration plan.
 * @returns The unchanged echo-agent registration plan.
 */
export function agentPlan(): RegistrationPlan {
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
        controls: ["stop", "approve", "follow-up"],
      },
    ],
    middlewares: [],
  };
}

/** Combines the verified runtime cohort with the scenario agent.
 * @param plan - Original registration plan owning the verified graph cohort.
 * @param agent - Native agent descriptor installed in the scenario manifest.
 * @returns The runtime cohort containing the supplied agent descriptor.
 */
export function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.echo": agent },
    middleware: {},
    requestTransforms: {},
  };
}
