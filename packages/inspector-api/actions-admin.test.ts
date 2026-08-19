import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";
import { identity, post, setup, activate } from "./actions-fixtures.ts";

describe("inspector administrative actions", () => {
  test("checks active generation, local state, and job/event admin protocols", async () => {
    const state = setup();
    activate(state);
    const ineligible = await post(state.app, "/actions/jobs/job-ineligible/retry", {
      ...identity,
      idempotencyKey: "job-bad",
    });
    expect(ineligible.status).toBe(409);

    const job = await post(state.app, "/actions/jobs/job-1/retry", {
      ...identity,
      idempotencyKey: "job-retry",
      reason: "operator requested retry",
    });
    const jobBody = await job.json();
    expect(job.status).toBe(200);
    expect(jobBody.record).toMatchObject({ action: "retry", instanceId: "job-1" });
    expect(JSON.stringify(jobBody)).not.toContain("must-not-cross");

    const cancel = await post(state.app, "/actions/jobs/job-1/cancel", {
      ...identity,
      idempotencyKey: "job-cancel",
    });
    expect(cancel.status).toBe(200);
    expect(
      (
        await post(state.app, "/actions/events/event-1/retry", {
          ...identity,
          idempotencyKey: "event-retry",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(state.app, "/actions/events/event-1/cancel", {
          ...identity,
          idempotencyKey: "event-cancel",
        })
      ).status,
    ).toBe(200);

    state.setActive({
      generationId: "generation-two",
      graphHash: "sha256:two",
      actions: state.actions,
    });
    const stale = await post(state.app, "/actions/functions/orders.create/invoke", {
      ...identity,
      idempotencyKey: "stale",
    });
    expect(stale.status).toBe(409);
  });

  test("approves and denies pending tool calls and audits outcomes", async () => {
    const state = setup();
    activate(state);
    const approved = await post(state.app, "/actions/tools/email.send/approval", {
      ...identity,
      idempotencyKey: "approval-1",
      invocationId: "invocation-1",
      toolCallId: "call-1",
      decision: "approve",
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).approval).toMatchObject({
      toolCallId: "call-1",
      state: "approved",
    });

    const denied = await post(state.app, "/actions/tools/email.send/deny", {
      ...identity,
      idempotencyKey: "approval-2",
      invocationId: "invocation-1",
      toolCallId: "call-2",
    });
    expect(denied.status).toBe(200);
    expect((await denied.json()).approval).toMatchObject({ toolCallId: "call-2", state: "denied" });
    expect(state.audits).toHaveLength(2);
  });

  test("rejects missing idempotency and unauthorized requests before mutation", async () => {
    const state = setup();
    activate(state);
    const missing = await post(state.app, "/actions/functions/orders.create/invoke", {
      ...identity,
      input: null,
    });
    expect(missing.status).toBe(400);

    const secured = new Hono();
    installInspectorEndpoints(secured, {
      bearerToken: "test-token",
      activeGeneration: { ...identity, actions: state.actions },
    });
    expect(
      (
        await post(secured, "/actions/functions/orders.create/invoke", {
          ...identity,
          idempotencyKey: "auth-1",
        })
      ).status,
    ).toBe(401);
  });
});
