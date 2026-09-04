import { expect, test } from "bun:test";
import { createRequestRecordBuilder, REQUEST_OUTCOMES } from "./src/index.ts";

test("emits discoverable starts and one authoritative completion without a stored timeline", () => {
  const builder = createRequestRecordBuilder({
    requestId: "request.test",
    traceId: "10000000000000000000000000000001",
    generationId: "generation.test",
    graphHash: "sha256:test",
    method: "GET",
    rawPath: "/hello",
    startedAt: 0,
    now: () => 1,
  });
  builder.setRoute("hello.route", "hello");
  builder.setInvocationId("invocation.root");
  builder.add({ kind: "accepted", at: 0 });
  const completed = builder.finish({ status: 200, completedAt: 1 });

  expect(builder.started).toMatchObject({ phase: "started", requestId: "request.test" });
  expect(builder.started).not.toHaveProperty("completedAt");
  expect(completed).toMatchObject({
    phase: "completed",
    routeId: "hello.route",
    functionId: "hello",
    invocationId: "invocation.root",
    outcome: "success",
  });
  expect(completed).not.toHaveProperty("timeline");
  expect(builder.finish({ status: 500 })).toBe(completed);
});

test("records every request outcome and preserves declared error identity", () => {
  const cases = [
    ["success", 200],
    ["declared-error", 409],
    ["validation-error", 422],
    ["timeout", 504],
    ["cancelled", 499],
    ["defect", 500],
  ] as const;
  const records = cases.map(([outcome, status], index) => {
    const builder = createRequestRecordBuilder({
      requestId: `request.${index}`,
      traceId: `${index + 1}`.padStart(32, "0"),
      generationId: "generation.test",
      graphHash: "sha256:test",
      method: "GET",
      rawPath: "/orders",
      startedAt: 0,
      now: () => 1,
    });
    builder.setOutcome(outcome, outcome === "declared-error" ? "orders.conflict" : undefined);
    return builder.finish({ status, completedAt: 1 });
  });

  expect(records.map(({ outcome }) => outcome)).toEqual([...REQUEST_OUTCOMES]);
  expect(records[1]).toMatchObject({ outcome: "declared-error", errorId: "orders.conflict" });
  expect(records.map(({ status }) => status)).toEqual(cases.map(([, status]) => status));
});
