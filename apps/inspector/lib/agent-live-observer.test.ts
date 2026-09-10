import { expect, test } from "bun:test";
import { observeAgentThread } from "../app/agent-live-observer";
import type { AgentObservation } from "../app/application-runtime-types";

test("agent observation resumes after a transport close without losing its checkpoint", async () => {
  const controller = new AbortController();
  const checkpoints: string[] = [];
  let attempt = 0;
  const client = {
    "relkit.agent.observe": async (input: unknown) => {
      checkpoints.push((input as { after: { sequence: string } }).after.sequence);
      attempt += 1;
      return events(attempt);
    },
  };
  const received: AgentObservation[] = [];
  await observeAgentThread({
    client: client as never,
    agentId: "orders.support",
    threadId: "thread-1",
    identity: {
      applicationId: "commerce",
      identityScope: "visitor",
      sessionEpoch: "session",
      publicFingerprint: "fingerprint",
    },
    after: { sequence: "0" },
    signal: controller.signal,
    onObservation: (observation) => {
      received.push(observation);
      if (received.length === 2) controller.abort();
    },
  });
  expect(checkpoints).toEqual(["0", "1"]);
  expect(received.map((item) => (item.kind === "event" ? item.event.eventId : "snapshot"))).toEqual(
    ["event-1", "event-2"],
  );
});

async function* events(attempt: number): AsyncIterable<AgentObservation> {
  yield {
    kind: "event",
    event: {
      eventId: `event-${attempt}`,
      runId: "run-1",
      checkpoint: { sequence: String(attempt) },
      createdAt: "2026-09-08T00:00:00.000Z",
      kind: "run-finished",
      value: {},
    },
  };
  if (attempt === 1) throw new Error("network error");
}
