import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "vitest";
import {
  createObservabilityCollector,
  type RequestRecord,
  type SpanRecord,
} from "@relkit/observability";
import { Hono } from "hono";
import { createFrameworkMiddleware } from "../src/middleware.js";
import { instrumentHttpRequest } from "../src/http-span.js";
import { frameworkTrace } from "@relkit/invocation";

import { startBunFixture } from "./bun-fixture.ts";

const parent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

test("keeps a request active until the response body reaches EOF", async () => {
  const collector = createObservabilityCollector();
  let release!: () => void;
  const app = appWith(collector);
  app.get("/stream", (context) =>
    context.body(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("first"));
          release = () => {
            controller.enqueue(new TextEncoder().encode("second"));
            controller.close();
          };
        },
      }),
    ),
  );
  const response = await app.request("http://localhost/stream", {
    headers: { traceparent: parent, "x-request-id": "attacker-controlled" },
  });
  const started = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "request" }> =>
        record.signal === "request",
    );
  expect(started).toHaveLength(1);
  expect(started[0]?.phase).toBe("started");
  expect(started[0]?.requestId).not.toBe("attacker-controlled");
  expect(started[0]?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  expect(
    collector.read().some((record) => record.signal === "span" && record.status === "completed"),
  ).toBe(false);
  release();
  expect(await response.text()).toBe("firstsecond");
  const records = collector.read();
  const completed = records.find(
    (record): record is Extract<typeof record, { signal: "request" }> =>
      record.signal === "request" && record.phase === "completed",
  );
  const root = records.find(
    (record): record is Extract<typeof record, { signal: "span" }> =>
      record.signal === "span" && record.status === "completed",
  );
  expect(completed?.traceId).toBe(started[0]?.traceId);
  expect(root?.parentSpanId).toBe("00f067aa0ba902b7");
  expect(root?.events?.map((event) => event.name)).toEqual([
    "http.received",
    "http.response.headers",
    "http.success",
  ]);
});

test("completes bodyless responses immediately and body cancellation once", async () => {
  const collector = createObservabilityCollector();
  const app = appWith(collector);
  app.get("/empty", (context) => context.body(null, 204));
  app.get("/cancel", (context) => context.body(new ReadableStream({ pull() {} })));
  await app.request("http://localhost/empty", { method: "HEAD" });
  const response = await app.request("http://localhost/cancel");
  await response.body?.cancel("client-left");
  const requests = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "request" }> =>
        record.signal === "request",
    );
  expect(requests.filter((record) => record.phase === "completed")).toHaveLength(2);
  expect(
    requests.find((record) => record.rawPath === "/cancel" && record.phase === "completed")
      ?.outcome,
  ).toBe("cancelled");
  const spans = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "span" }> =>
        record.signal === "span" && record.status === "completed",
    );
  expect(spans).toHaveLength(2);
});

test("the generated-host boundary owns early and nested Hono requests without duplicate roots", async () => {
  const collector = createObservabilityCollector();
  const options = {
    observability: collector,
    generationId: "generation.test",
    graphHash: "sha256:http-span",
  };
  const app = new Hono();
  for (const middleware of createFrameworkMiddleware(options)) app.use("*", middleware.handler);
  app.get("/nested", (context) => context.text("ok"));

  const early = await instrumentHttpRequest(new Request("http://localhost/early"), options, () =>
    Response.json({ error: "not-ready" }, { status: 503 }),
  );
  await early.text();
  const nestedRequest = new Request("http://localhost/nested");
  const nested = await instrumentHttpRequest(nestedRequest, options, () =>
    app.fetch(nestedRequest),
  );
  expect(await nested.text()).toBe("ok");

  const requests = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "request" }> =>
        record.signal === "request",
    );
  const spans = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "span" }> =>
        record.signal === "span" && record.status === "completed",
    );
  expect(requests.filter((record) => record.phase === "started")).toHaveLength(2);
  expect(requests.filter((record) => record.phase === "completed")).toHaveLength(2);
  expect(spans).toHaveLength(2);
  expect(early.headers.has("x-trace-id")).toBe(false);
});

test("keeps raw dynamic paths out of server span names", async () => {
  const collector = createObservabilityCollector();
  const rawId = "83d73f9a-1048-4f80-95f1-f0c77a996df1";
  const response = await instrumentHttpRequest(
    new Request(`http://localhost/orders/${rawId}`),
    {
      observability: collector,
      generationId: "generation.test",
      graphHash: "sha256:http-span",
    },
    () => {
      frameworkTrace.rename("GET /orders/:orderId");
      return new Response("ok");
    },
  );
  await response.text();
  const spans = collector
    .read()
    .filter(
      (record): record is Extract<typeof record, { signal: "span" }> => record.signal === "span",
    );
  expect(spans.at(-1)?.name).toBe("GET /orders/:orderId");
  expect(JSON.stringify(spans)).not.toContain(rawId);
});

test("observes real Bun response EOF, client abort, HEAD, and runtime shutdown once", async () => {
  const server = await startBunFixture("http-span");
  const base = `http://127.0.0.1:${server.port}`;
  const records = async (): Promise<readonly (RequestRecord | SpanRecord)[]> =>
    (await fetch(`${base}/__fixture/records`)).json() as Promise<
      readonly (RequestRecord | SpanRecord)[]
    >;
  const completed = async () =>
    (await records()).filter(
      (record): record is Extract<typeof record, { signal: "request" }> =>
        record.signal === "request" && record.phase === "completed",
    );
  const spans = async () =>
    (await records()).filter(
      (record): record is Extract<typeof record, { signal: "span" }> =>
        record.signal === "span" && record.status === "completed",
    );
  try {
    expect((await fetch(`${base}/head`, { method: "HEAD" })).status).toBe(204);
    const response = await fetch(`${base}/stream`);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    expect(await completed()).toHaveLength(1);
    await fetch(`${base}/__fixture/release`);
    await reader.read();
    await reader.read();
    await waitFor(async () => (await completed()).length === 2);
    const abort = new AbortController();
    const cancelled = await fetch(`${base}/abort`, { signal: abort.signal });
    await cancelled.body!.getReader().read();
    abort.abort("client-left");
    await waitFor(async () =>
      (await completed()).some(
        (record) => record.rawPath === "/abort" && record.outcome === "cancelled",
      ),
    );
    expect(await spans()).toHaveLength(3);
    const shutdown = await fetch(`${base}/shutdown`);
    await shutdown.body!.getReader().read();
    await fetch(`${base}/__fixture/close`);
    await waitFor(async () =>
      (await spans()).some((record) => record.attributes?.["relkit.incomplete"] === true),
    );
    expect(await spans()).toHaveLength(4);
  } finally {
    await server.stop();
  }
});

function appWith(collector: ReturnType<typeof createObservabilityCollector>): Hono {
  const app = new Hono();
  for (const middleware of createFrameworkMiddleware({
    observability: collector,
    generationId: "generation.test",
    graphHash: "sha256:http-span",
  }))
    app.use("*", middleware.handler);
  return app;
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await sleep(10);
  }
  throw new Error("Timed out waiting for HTTP telemetry");
}
