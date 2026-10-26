/** Supplies the unchanged approval-enabled registration plan, runtime cohort and bounded status polling to the native approval transport fixture. */
import { setTimeout as sleep } from "node:timers/promises";
import type { RegistrationPlan } from "@relkit/graph";
import type { RuntimeManifest } from "../src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

/** Polls native approval state with the original 100 attempts and 10ms delay.
 * @param client - Public RPC client addressing the scenario's native application.
 * @param agentId - Registered agent identity selected by the scenario.
 * @param threadId - Durable conversation identity reused across RPC requests.
 * @param status - Exact persisted thread status required before returning.
 * @returns The matching approval snapshot, or a rejection after the original polling window.
 */
export async function waitForStatus(
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

/** Constructs the approval agent registration plan without changing capabilities.
 * @returns The unchanged approval-enabled registration plan.
 */
export function approvalPlan(): RegistrationPlan {
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
        generatedFunction: {
          functionId: "relkit.agent.support.approval.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "support.approval",
        },
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

/** Combines the selected approval agent with its runtime cohort.
 * @param plan - Original registration plan owning the verified graph cohort.
 * @param agent - Native agent descriptor installed in the scenario manifest.
 * @returns The runtime cohort containing the supplied agent descriptor.
 */
export function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.approval": agent },
    middleware: {},
    requestTransforms: {},
  };
}
