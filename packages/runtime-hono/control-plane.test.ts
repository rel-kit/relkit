import { expect, test } from "bun:test";
import {
  createObservabilityCollector,
  type RequestRecord,
  type SpanRecord,
} from "@relkit/observability";
import { Hono } from "hono";
import { instrumentHttpRequest } from "./src/http-span.js";
import { createFrameworkMiddleware } from "./src/middleware.js";

const controlPlanePaths = [
  "/_relkit",
  "/_relkit/v1/health/ready",
  "/_relkit/v1/graph",
  "/_relkit/v1/functions",
  "/_relkit/v1/runtime/buckets/assets/objects",
  "/_relkit/v1/actions/functions/orders.create/invoke",
  "/_relkit/v1/openapi.json",
  "/_relkit/v1/client-contract.json",
  "/_relkit/v1/logs",
  "/_relkit/v1/stream",
] as const;

test("keeps the RELKIT control plane out of application telemetry", async () => {
  const collector = createObservabilityCollector();
  const lifecycle: string[] = [];
  const options = {
    observability: collector,
    generationId: "generation.test",
    graphHash: "sha256:control-plane",
    maxBodyBytes: 1,
    onLifecycleEvent: (event: { readonly type: string }) => lifecycle.push(event.type),
  };
  const app = new Hono();
  for (const middleware of createFrameworkMiddleware(options)) app.use("*", middleware.handler);
  app.all("*", (context) => context.text("ok"));

  for (const path of controlPlanePaths) {
    const action = path.includes("/actions/");
    const response = await app.request(`http://localhost${path}`, {
      method: action ? "POST" : "GET",
      ...(action ? { body: "x", headers: { "content-length": "1" } } : {}),
    });
    expect(await response.text()).toBe("ok");
    expect(response.headers.has("x-request-id")).toBe(false);
  }

  const oversized = await app.request(
    "http://localhost/_relkit/v1/actions/functions/orders.create/invoke",
    { method: "POST", body: "{}", headers: { "content-length": "2" } },
  );
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toEqual({ error: "payload-too-large" });

  const nestedRequest = new Request("http://localhost/_relkit/v1/graph");
  const nested = await instrumentHttpRequest(nestedRequest, options, (request) =>
    app.fetch(request),
  );
  expect(await nested.text()).toBe("ok");
  expect(collector.read()).toEqual([]);
  expect(lifecycle).toEqual([]);

  const application = await app.request("http://localhost/_relkit-app");
  expect(await application.text()).toBe("ok");
  expect(application.headers.has("x-request-id")).toBe(true);
  expect(
    collector
      .read()
      .filter(
        (record): record is RequestRecord =>
          record.signal === "request" && record.phase === "completed",
      ),
  ).toHaveLength(1);
  expect(
    collector
      .read()
      .filter(
        (record): record is SpanRecord => record.signal === "span" && record.status === "completed",
      ),
  ).toHaveLength(1);
  expect(lifecycle).toEqual(["request.started", "request.completed"]);
});
