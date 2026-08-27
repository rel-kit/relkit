import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@relkit/contracts";
import { Hono } from "hono";
import {
  INSPECTOR_ACTION_PATHS,
  INSPECTOR_API_PATHS,
  OBSERVABILITY_ENDPOINT_PATHS,
  installInspectorEndpoints,
} from "./src/index.ts";
import { identity, json, makeApp, post, secret } from "./contracts-fixtures.ts";

describe("inspector action and authorization contracts", () => {
  test("runs every local action endpoint through its safe projection", async () => {
    const { app } = makeApp();
    const cases: readonly [string, Record<string, unknown>][] = [
      [
        "/actions/functions/orders.create/invoke",
        { ...identity, idempotencyKey: "invoke-action", input: { orderId: "order-1" } },
      ],
      ["/actions/jobs/orders.job/retry", { ...identity, idempotencyKey: "job-retry" }],
      ["/actions/jobs/orders.job/cancel", { ...identity, idempotencyKey: "job-cancel" }],
      ["/actions/events/orders.created/retry", { ...identity, idempotencyKey: "event-retry" }],
      ["/actions/events/orders.created/cancel", { ...identity, idempotencyKey: "event-cancel" }],
      [
        "/actions/tools/orders.tool/approval",
        {
          ...identity,
          idempotencyKey: "tool-approval",
          invocationId: "invocation-1",
          toolCallId: "call-1",
          decision: "approve",
        },
      ],
      [
        "/actions/tools/orders.tool/approve",
        {
          ...identity,
          idempotencyKey: "tool-approve",
          invocationId: "invocation-1",
          toolCallId: "call-2",
        },
      ],
      [
        "/actions/tools/orders.tool/deny",
        {
          ...identity,
          idempotencyKey: "tool-deny",
          invocationId: "invocation-1",
          toolCallId: "call-3",
        },
      ],
    ];
    for (const [path, body] of cases) {
      const response = await post(app, path, body);
      expect(response.status, path).toBe(200);
      const result = await response.json();
      expect(result.protocol).toBe("relkit.inspector");
      expect(result.action ?? result.record ?? result.approval).toBeDefined();
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  test("protects every endpoint and action in production", async () => {
    const { app, stream } = makeApp({ mode: "production", bearerToken: "test-token" });
    for (const path of [
      API_BASE_PATH,
      API_BASE_PATH + "/health/live",
      API_BASE_PATH + "/health/ready",
      API_BASE_PATH + "/graph",
      API_BASE_PATH + "/functions",
      API_BASE_PATH + "/runtime/functions",
      API_BASE_PATH + "/requests",
      API_BASE_PATH + "/logs",
      API_BASE_PATH + "/traces",
      API_BASE_PATH + "/diagnostics",
      API_BASE_PATH + "/stream",
    ])
      expect((await app.request(path)).status).toBe(401);
    for (const path of INSPECTOR_ACTION_PATHS)
      expect((await post(app, path.slice(API_BASE_PATH.length), {})).status).toBe(401);
    const headers = { authorization: "Bearer test-token" };
    expect((await app.request(API_BASE_PATH + "/graph", { headers })).status).toBe(200);
    stream.publish({ type: "generation.changed", data: { generationId: identity.generationId } });
    const authorizedStream = await app.request(API_BASE_PATH + "/stream", { headers });
    expect(authorizedStream.status).toBe(200);
    await authorizedStream.body!.getReader().cancel();
  });

  test("advertises every installed endpoint family and action", async () => {
    const { app } = makeApp();
    expect(new Set(INSPECTOR_API_PATHS).size).toBe(INSPECTOR_API_PATHS.length);
    expect(INSPECTOR_API_PATHS).toEqual(
      expect.arrayContaining([
        API_BASE_PATH + "/graph/descriptors/:id",
        API_BASE_PATH + "/graph/source/:id",
        ...OBSERVABILITY_ENDPOINT_PATHS,
        ...INSPECTOR_ACTION_PATHS,
      ]),
    );
    expect((await json(app, API_BASE_PATH)).capabilities).toEqual(
      expect.arrayContaining(INSPECTOR_ACTION_PATHS),
    );
  });
});
