/**
 * A function the application refuses (no session, a declared error, invalid input) answers the
 * Inspector with the application's HTTP status and safe error code under `cause`, never the
 * failure's message or data (IN-02). Failures that are not the application's answer keep the
 * existing body without a cause.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { defineFunction } from "relkit/app";
import { invoke as engineInvoke, type InvocationTarget } from "relkit/engine";
import {
  applicationFailure,
  InvocationValidationError,
  type ApplicationFailure,
} from "relkit/invocation";
import { z } from "relkit/schema";
import { installInspectorEndpoints } from "../../../src/inspector-api/index.ts";
import { responseJson } from "../fixtures/json.ts";
import { identity, post } from "./actions-fixtures.ts";

/**
 * Installs an Inspector whose function invoke fails with the given value.
 * @param failure - What the native invoke throws.
 * @returns The installed router.
 */
function refusingApp(failure: Error | ApplicationFailure): Hono {
  const app = new Hono();
  installInspectorEndpoints(app, {
    getActiveGeneration: () => ({
      ...identity,
      actions: {
        functions: {
          exists: () => true,
          invoke: async () => {
            throw failure;
          },
        },
      },
    }),
  });
  return app;
}

/**
 * Invokes `orders.create` once and reads the rejected body.
 * @param app - Installed router.
 * @param key - Idempotency key.
 * @returns The response status and parsed body.
 */
async function invoke(app: Hono, key: string) {
  const response = await post(app, "/actions/functions/orders.create/invoke", {
    ...identity,
    idempotencyKey: key,
    input: { orderId: "order-1" },
  });
  return { status: response.status, body: await responseJson<Record<string, unknown>>(response) };
}

describe("rejected function actions keep the application's answer", () => {
  test("an access rule without a session answers 401 unauthenticated", async () => {
    const failure = applicationFailure({
      id: "unauthenticated",
      message: "This function requires a signed-in session.",
      data: null,
      status: 401,
    });
    const { status, body } = await invoke(refusingApp(failure), "refused-1");
    expect(status).toBe(409);
    expect(body.error).toBe("RELKIT_INSPECTOR_ACTION_FAILED");
    expect(body.cause).toEqual({ status: 401, code: "unauthenticated" });
    expect(JSON.stringify(body)).not.toContain("signed-in session");
  });

  test("the engine's own access refusal is reported as 401 unauthenticated", async () => {
    const guarded = defineFunction({
      id: "orders.guarded",
      input: z.object({ orderId: z.string() }),
      output: z.object({ ok: z.boolean() }),
      access: { roles: ["admin"] },
      handler: async () => ({ ok: true }),
    }) as unknown as InvocationTarget;
    const refusal = await engineInvoke({
      target: guarded,
      input: { orderId: "order-1" },
      source: "direct",
    }).then(
      () => new Error("invoke unexpectedly succeeded"),
      (error: Error) => error,
    );
    const { body } = await invoke(refusingApp(refusal), "refused-engine");
    expect(body.cause).toEqual({ status: 401, code: "unauthenticated" });
  });

  test("a declared error keeps its status and id but not its data", async () => {
    const failure = applicationFailure({
      id: "orders.not-found",
      message: "Order order-secret was not found.",
      data: { orderId: "order-secret" },
      status: 404,
    });
    const { body } = await invoke(refusingApp(failure), "refused-2");
    expect(body.cause).toEqual({ status: 404, code: "orders.not-found" });
    expect(JSON.stringify(body)).not.toContain("order-secret");
  });

  test("invalid input names the failing fields without the rejected values", async () => {
    const failure = new InvocationValidationError("input", [
      { message: "Expected string, received 42", path: [{ key: "orderId" }] },
    ]);
    const { body } = await invoke(refusingApp(failure), "refused-3");
    expect(body.cause).toEqual({
      status: 422,
      code: "validation",
      issues: [{ path: ["orderId"], code: "validation" }],
    });
    expect(JSON.stringify(body)).not.toContain("received 42");
  });

  test("a failure that is not the application's answer has no cause", async () => {
    const { status, body } = await invoke(
      refusingApp(new Error("Provider registry unavailable.")),
      "refused-4",
    );
    expect(status).toBe(409);
    expect(body.error).toBe("RELKIT_INSPECTOR_ACTION_FAILED");
    expect(body.cause).toBeUndefined();
  });
});
