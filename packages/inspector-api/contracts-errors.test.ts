import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "@zsys/contracts";
import { createObservabilityStream } from "@zsys/observability";
import { Hono } from "hono";
import { installInspectorEndpoints } from "./src/index.ts";
import {
  expectResponse,
  identity,
  json,
  makeApp,
  post,
  queryFixture,
} from "./contracts-fixtures.ts";

describe("inspector invalid and unavailable contracts", () => {
  test("rejects version, malformed cursor, and malformed ID requests", async () => {
    const { app } = makeApp();
    for (const headers of [
      { "x-zsys-api-version": "2" },
      { accept: "application/json; version=2" },
    ]) {
      const response = await app.request(API_BASE_PATH + "/graph", { headers });
      expectResponse(response, 400);
      expect((await response.json()).error).toBe("ZSYS_INSPECTOR_API_VERSION_UNSUPPORTED");
    }
    expectResponse(await app.request(API_BASE_PATH + "/graph?protocol=wrong"), 400);
    expectResponse(
      await app.request(API_BASE_PATH + "/logs", {
        headers: { "x-zsys-api-version": "2" },
      }),
      400,
    );
    for (const path of [
      API_BASE_PATH + "/functions?cursor=bad",
      API_BASE_PATH + "/functions?limit=0",
      API_BASE_PATH + "/logs?cursor=bad",
      API_BASE_PATH + "/stream?cursor=bad",
      API_BASE_PATH + "/stream?type=unknown",
      API_BASE_PATH + "/stream?cursor=0&afterCursor=1",
      API_BASE_PATH + "/stream?overflow=drop-oldest&backpressure=drop-newest",
    ])
      expectResponse(await app.request(path), 400);
    await json(app, API_BASE_PATH + "/functions/not%2Fvalid", 404);
    const invalidAction = await post(app, "/actions/functions/%2Fbad/invoke", {
      ...identity,
      idempotencyKey: "malformed-id",
    });
    expectResponse(invalidAction, 400);
    expect((await invalidAction.json()).error).toBe("ZSYS_INSPECTOR_ACTION_TARGET_INVALID");
  });

  test("returns unavailable-generation contracts without invoking services", async () => {
    const app = new Hono();
    installInspectorEndpoints(app, {
      getActiveGeneration: async () => undefined,
      query: queryFixture(),
      stream: createObservabilityStream(),
    });
    for (const path of [
      API_BASE_PATH + "/health/ready",
      API_BASE_PATH + "/graph",
      API_BASE_PATH + "/functions",
      API_BASE_PATH + "/env",
      API_BASE_PATH + "/diagnostics",
      API_BASE_PATH + "/runtime/functions",
      API_BASE_PATH + "/source/orders.create",
    ])
      expectResponse(await app.request(path), 503);
    const action = await post(app, "/actions/functions/orders.create/invoke", {
      ...identity,
      idempotencyKey: "unavailable-generation",
    });
    expectResponse(action, 503);
    expect((await action.json()).error).toBe("ZSYS_INSPECTOR_ACTION_GENERATION_UNAVAILABLE");
  });
});
