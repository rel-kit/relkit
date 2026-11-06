import { expect, test } from "bun:test";
import {
  actionPath,
  parseJsonInput,
  postInspectorAction,
  triggeredRunId,
} from "./inspector-actions";

test("posts an action with the generation identity and a fresh idempotency key", async () => {
  const calls: { path: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    [];
  const client = {
    request: async <T>(path: string, options?: { body?: unknown; headers?: unknown }) => {
      calls.push({
        path,
        body: JSON.parse(String(options?.body)) as Record<string, unknown>,
        headers: options?.headers as Record<string, string>,
      });
      return {} as T;
    },
  };
  await postInspectorAction(
    client as never,
    actionPath("events", "orders/created", "publish"),
    { generationId: "g1", graphHash: "sha256:one" },
    { input: { orderId: "o1" } },
  );
  expect(calls[0]?.path).toBe("/_relkit/v1/actions/events/orders%2Fcreated/publish");
  expect(calls[0]?.body).toMatchObject({
    generationId: "g1",
    graphHash: "sha256:one",
    input: { orderId: "o1" },
  });
  expect(calls[0]?.body.idempotencyKey).toBe(calls[0]?.headers["idempotency-key"]);
});

test("parses JSON input and names the triggered run", () => {
  expect(parseJsonInput('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  expect(parseJsonInput("{")).toEqual({ ok: false, error: "Enter valid JSON." });
  expect(triggeredRunId({ result: { instanceId: "run-1" } })).toBe("run-1");
  expect(triggeredRunId({ result: "nothing" })).toBeUndefined();
});
