import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";
import { activate, identity, makeGeneration, post, setup } from "./actions-fixtures.ts";

describe("inspector function actions", () => {
  test("invokes only the active function and deduplicates safe requests", async () => {
    const state = setup();
    activate(state);
    const first = await post(state.app, "/actions/functions/orders.create/invoke", {
      ...identity,
      idempotencyKey: "function-1",
      input: { orderId: "order-1" },
    });
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.output).toEqual({ ok: true });
    expect(JSON.stringify(firstBody)).not.toContain("raw-secret");
    expect(JSON.stringify(firstBody)).not.toContain("must-not-cross");
    expect(state.calls()).toBe(1);

    const replay = await post(state.app, "/actions/functions/orders.create/invoke", {
      ...identity,
      idempotencyKey: "function-1",
      input: { orderId: "order-1" },
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).action.actionId).toBe(firstBody.action.actionId);
    expect(state.calls()).toBe(1);

    const conflict = await post(state.app, "/actions/functions/orders.create/invoke", {
      ...identity,
      idempotencyKey: "function-1",
      input: { orderId: "order-2" },
    });
    expect(conflict.status).toBe(409);
  });

  test("accepts identity headers and keeps production actions protected", async () => {
    const state = setup();
    activate(state);
    const headerRequest = await post(
      state.app,
      "/actions/functions/orders.create/invoke",
      { input: null },
      {
        "x-zsys-generation-id": identity.generationId,
        "x-zsys-graph-hash": identity.graphHash,
        "idempotency-key": "header-1",
      },
    );
    expect(headerRequest.status).toBe(200);

    const production = new Hono();
    installInspectorEndpoints(production, {
      mode: "production",
      enabled: true,
      bearerToken: "test-token",
      activeGeneration: { ...makeGeneration(), actions: state.actions },
    });
    const response = await post(
      production,
      "/actions/functions/orders.create/invoke",
      { ...identity, idempotencyKey: "production-1" },
      { authorization: "Bearer test-token" },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("ZSYS_INSPECTOR_ACTIONS_DISABLED");
  });
});
