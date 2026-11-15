/**
 * The history filters the stores implement reach them over HTTP: `status`, `method`, `path`,
 * `errorId` and the opt-in `count` (task 14.9). A rejected query answers with the validator's own
 * message and the parameter it names, so the Inspector can show why at the field (task 14.10);
 * failures of any other kind keep answering with their code only.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { API_BASE_PATH } from "relkit/contracts";
import { createObservabilityStream } from "relkit/observability";
import { validate } from "relkit/observability/query";
import { installInspectorEndpoints } from "../../../src/inspector-api/index.ts";
import { json, makeApp, makeGeneration, queryFixture } from "./contracts-fixtures.ts";

/**
 * Builds the router over a store that validates like the real ones, or fails privately.
 * @param failure - A private failure the store throws instead of answering.
 * @returns The installed router.
 */
function validatingApp(failure?: Error): Hono {
  const app = new Hono();
  const fixture = queryFixture();
  installInspectorEndpoints(app, {
    activeGeneration: makeGeneration(),
    stream: createObservabilityStream(),
    query: {
      ...fixture,
      requests: async (query = {}) => {
        if (failure !== undefined) throw failure;
        validate(query, 100);
        return fixture.requests(query);
      },
    },
  });
  return app;
}

describe("history query filters", () => {
  test("request filters and count are passed to the store", async () => {
    const { app, seen } = makeApp();
    await json(
      app,
      API_BASE_PATH +
        "/requests?status=5xx&method=get&path=%2Forders&errorId=orders.invalid&count=true",
    );
    expect(seen.at(-1)).toMatchObject({
      status: "5xx",
      method: "get",
      path: "/orders",
      errorId: "orders.invalid",
      count: "true",
    });
  });

  test("a filter the store rejects answers with the validator's message and parameter", async () => {
    const body = await json(validatingApp(), `${API_BASE_PATH}/requests?status=999`, 400);
    expect(body).toMatchObject({
      error: "RELKIT_OBSERVABILITY_QUERY_INVALID",
      parameter: "status",
      message: expect.stringContaining("status is invalid: expected an HTTP status from 100"),
    });
  });

  test("a parameter the API itself rejects names it too", async () => {
    const body = await json(validatingApp(), `${API_BASE_PATH}/requests?limit=many`, 400);
    expect(body).toMatchObject({
      error: "RELKIT_OBSERVABILITY_QUERY_INVALID",
      parameter: "limit",
      message: "Observability query limit is invalid",
    });
  });

  test("a failure of another kind keeps its message private", async () => {
    const body = await json<Record<string, unknown>>(
      validatingApp(new Error("private store diagnostic")),
      `${API_BASE_PATH}/requests?status=500`,
      500,
    );
    expect(body.error).toBe("RELKIT_OBSERVABILITY_INTERNAL");
    expect(body).not.toHaveProperty("message");
    expect(JSON.stringify(body)).not.toContain("private store diagnostic");
  });
});
