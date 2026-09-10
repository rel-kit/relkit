import { expect, test } from "bun:test";
import type { RegistrationPlan } from "@relkit/graph";
import { createApp } from "./src/index.ts";
import { runtimeCohort } from "./test-cohort.ts";

test("native SSE emits explicit item, completion, and sanitized failure events", async () => {
  const complete = service(async function* () {
    yield { value: 1 };
  });
  const success = await complete.request("/stream");
  expect(success.headers.get("content-type")).toContain("text/event-stream");
  expect(await success.text()).toBe(
    'event: relkit-item\ndata: {"value":1}\n\nevent: relkit-complete\ndata: {"ok":true}\n\n',
  );

  const failed = service(async function* () {
    yield { value: 1 };
    throw new Error("private details");
  });
  const body = await (await failed.request("/stream")).text();
  expect(body).toContain("event: relkit-error");
  expect(body).not.toContain("private details");
});

test("pre-header failures map normally and text failures abort the body", async () => {
  const immediate = service(async function* () {
    throw new Error("first failure");
  });
  expect((await immediate.request("/stream")).status).toBe(500);

  const later = service(async function* () {
    yield "ready";
    throw new Error("later failure");
  }, "text");
  const response = await later.request("/stream");
  await expect(response.text()).rejects.toThrow("later failure");
});

function service(stream: () => AsyncIterable<unknown>, format: "sse" | "text" | "bytes" = "sse") {
  const plan = streamPlan(format);
  return createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
    },
    mapInput: () => ({}),
    engine: { invoke: async () => stream() },
  });
}

function streamPlan(format: "sse" | "text" | "bytes"): RegistrationPlan {
  return {
    graphHash: "sha256:native-stream",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "stream.route",
        source: { file: "route.ts", line: 1, column: 1 },
        triggerType: "http",
        targetFunctionId: "stream",
        config: {
          method: "GET",
          path: "/stream",
          request: { kind: "input" },
          responses: [],
          middleware: [],
          transforms: [],
          stream: { format },
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
    middlewares: [],
  };
}
