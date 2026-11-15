import { expect, test } from "vitest";
import { createObservabilityCollector } from "../../src/observability/index.js";
import { Hono } from "hono";
import { instrumentHttpRequest } from "../../src/runtime-hono/http-span.js";
import { createFrameworkMiddleware } from "../../src/runtime-hono/middleware.js";

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

test("keeps the RelKit control plane out of application telemetry but names each response", async () => {
  const collector = createObservabilityCollector();
  const lifecycle: string[] = [];
  const options = {
    observability: collector,
    generationId: "generation.test",
    graphHash: "sha256:control-plane",
    maxBodyBytes: 1,
    onLifecycleEvent: (event: { readonly type: string }) => {
      lifecycle.push(event.type);
    },
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
    expect(response.headers.get("x-request-id")).toMatch(/^request-/);
  }

  const oversized = await app.request(
    "http://localhost/_relkit/v1/actions/functions/orders.create/invoke",
    { method: "POST", body: "{}", headers: { "content-length": "2" } },
  );
  expect(oversized.status).toBe(413);
  expect(oversized.headers.get("x-request-id")).toMatch(/^request-/);
  expect(await oversized.json()).toMatchObject({
    type: "/errors/payload-too-large",
    status: 413,
    code: "payload-too-large",
  });

  const nestedRequest = new Request("http://localhost/_relkit/v1/graph");
  const nested = await instrumentHttpRequest(nestedRequest, options, (request) =>
    app.fetch(request),
  );
  expect(await nested.text()).toBe("ok");
  expect(nested.headers.get("x-request-id")).toMatch(/^request-/);
  const direct = await instrumentHttpRequest(
    new Request("http://localhost/_relkit/v1/health/live"),
    options,
    () => new Response("live"),
  );
  expect(direct.headers.get("x-request-id")).toMatch(/^request-/);
  expect(collector.read()).toEqual([]);
  expect(lifecycle).toEqual([]);

  const application = await app.request("http://localhost/_relkit-app");
  expect(await application.text()).toBe("ok");
  expect(application.headers.has("x-request-id")).toBe(true);
  expect(
    collector
      .read()
      .filter(
        (record): record is Extract<typeof record, { signal: "request" }> =>
          record.signal === "request" && record.phase === "completed",
      ),
  ).toHaveLength(1);
  expect(
    collector
      .read()
      .filter(
        (record): record is Extract<typeof record, { signal: "span" }> =>
          record.signal === "span" && record.status === "completed",
      ),
  ).toHaveLength(1);
  expect(lifecycle).toEqual(["request.started", "request.completed"]);
});

// 27.1 (e): an unmatched control-plane path's Problem names the request ID of its header.
test("a control-plane Problem names the request ID of its header", async () => {
  const { installUnmatchedRoute } = await import("../../src/runtime-hono/unmatched-route.js");
  const { internalProblem } = await import("../../src/runtime-hono/internal-endpoints-utils.js");
  const app = new Hono();
  for (const middleware of createFrameworkMiddleware({ maxBodyBytes: 1_024 }))
    app.use("*", middleware.handler);
  app.get("/_relkit/v1/protected", (context) => internalProblem(context, 401, "denied", "No."));
  installUnmatchedRoute(app);
  for (const path of ["/_relkit/v1/nope", "/_relkit/v1/health/nope", "/_relkit/v1/protected"]) {
    const response = await instrumentHttpRequest(
      new Request(`http://localhost${path}`),
      {},
      (request) => app.fetch(request),
    );
    const body = (await response.json()) as { requestId?: string };
    expect([path, body.requestId]).toEqual([path, response.headers.get("x-request-id")]);
  }
});

test("the framework RPC endpoint stays application traffic under the reserved prefix", async () => {
  const { isRelkitControlPlanePath } = await import("../../src/runtime-hono/control-plane.js");
  expect(isRelkitControlPlanePath("/_relkit/v1/rpc")).toBe(false);
  expect(isRelkitControlPlanePath("/_relkit/v1/rpc/relkit.agent.run")).toBe(false);
  expect(isRelkitControlPlanePath("/_relkit/v1/rpcx")).toBe(true);
  expect(isRelkitControlPlanePath("/_relkit/v1/graph")).toBe(true);
});
