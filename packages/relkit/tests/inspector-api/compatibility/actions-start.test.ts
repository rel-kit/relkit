/** Inspector actions that start work: trigger a job, publish an event, replay a publication. */
import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION } from "relkit/contracts";
import type {
  InspectorEventPublishRequest,
  InspectorEventReplayRequest,
  InspectorJobTriggerRequest,
} from "../../../src/inspector-api/index.ts";
import { identity, post, setup } from "./actions-fixtures.ts";

/** Activates the shared fixture with start-capable job and event services. */
function startState() {
  const state = setup();
  const calls = {
    trigger: [] as InspectorJobTriggerRequest[],
    publish: [] as InspectorEventPublishRequest[],
    replay: [] as InspectorEventReplayRequest[],
  };
  state.setActive({
    ...identity,
    actions: {
      ...state.actions,
      jobs: {
        ...state.actions.jobs,
        trigger: async (request) => {
          calls.trigger.push(request);
          return { instanceId: "run-1", state: "accepted", handler: () => "must-not-cross" };
        },
      },
      events: {
        ...state.actions.events,
        publish: async (request) => {
          calls.publish.push(request);
          return { publicationId: "publication-1", deliveries: 2 };
        },
        replay: async (request) => {
          calls.replay.push(request);
          return { publicationId: request.publicationId, deliveries: 2 };
        },
      },
    },
  });
  return { state, calls };
}

describe("inspector start actions", () => {
  test("triggers a job run and returns its instance", async () => {
    const { state, calls } = startState();
    const response = await post(state.app, "/actions/jobs/receipts.send-job/trigger", {
      ...identity,
      idempotencyKey: "trigger-1",
      input: { orderId: "order-1" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.result).toEqual({ instanceId: "run-1", state: "accepted" });
    expect(calls.trigger).toEqual([
      {
        protocol: "relkit.jobs.admin",
        version: PROTOCOL_VERSION,
        jobId: "receipts.send-job",
        input: { orderId: "order-1" },
        idempotencyKey: "trigger-1",
      },
    ]);
    expect(state.audits).toContainEqual(
      expect.objectContaining({ action: "job.trigger", outcome: "applied" }),
    );
  });

  test("publishes an event with a payload and an optional version", async () => {
    const { state, calls } = startState();
    const response = await post(state.app, "/actions/events/orders.created/publish", {
      ...identity,
      idempotencyKey: "publish-1",
      eventVersion: 1,
      input: { orderId: "order-1" },
    });
    expect(response.status).toBe(200);
    expect(calls.publish[0]).toMatchObject({
      eventId: "orders.created",
      eventVersion: 1,
      payload: { orderId: "order-1" },
    });
    const invalid = await post(state.app, "/actions/events/orders.created/publish", {
      ...identity,
      idempotencyKey: "publish-2",
      eventVersion: "one",
      input: {},
    });
    expect(invalid.status).toBe(400);
  });

  test("replays a recorded publication and records the action in the audit history", async () => {
    const { state, calls } = startState();
    const response = await post(state.app, "/actions/events/publication-1/replay", {
      ...identity,
      idempotencyKey: "replay-1",
      reason: "consumer fixed",
    });
    expect(response.status).toBe(200);
    expect(calls.replay[0]).toMatchObject({
      publicationId: "publication-1",
      reason: "consumer fixed",
    });
    expect(state.audits).toContainEqual(
      expect.objectContaining({ action: "event.replay", targetId: "publication-1" }),
    );
  });

  test("a generation without start methods answers unsupported", async () => {
    const state = setup();
    state.setActive({ ...identity, actions: state.actions });
    for (const path of [
      "/actions/jobs/receipts.send-job/trigger",
      "/actions/events/orders.created/publish",
      "/actions/events/publication-1/replay",
    ]) {
      const response = await post(state.app, path, { ...identity, idempotencyKey: path });
      expect(response.status).toBe(501);
      expect(await response.json()).toMatchObject({ error: "RELKIT_INSPECTOR_ACTION_UNSUPPORTED" });
    }
  });
});
