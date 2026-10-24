import { expect, test } from "bun:test";
import { Hono } from "../../packages/inspector-api/node_modules/hono";
import {
  installInspectorEndpoints,
  InspectorQueryError,
} from "../../packages/inspector-api/src/index.ts";
import { inspectorEndpointsSource } from "../../packages/cli/src/commands/build-server-http-inspector.ts";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.ts";

function application() {
  const app = new Hono();
  const plan = {
    jobs: [],
    events: [{ id: "demo.event", profile: "local" }],
    buckets: [{ id: "demo.bucket", profile: "local" }],
    caches: [],
  };
  const eventProvider = {
    query: () => ({
      events: [],
      triggers: [],
      capabilities: [],
      publications: [{ eventId: "demo.event", instanceId: "publication" }],
      deliveries: [{ eventId: "demo.event", deliveryId: "delivery", state: "completed" }],
    }),
  };
  const registry = {
    resolve: (capability: string) => ({
      value: capability === "event" ? eventProvider : {},
      binding: { adapter: { features: ["signedReadUrl", "signedWriteUrl"] } },
    }),
  };
  const source = inspectorEndpointsSource({ maxPreviewBytes: 1024 } as never);
  new Function(
    "app",
    "installInspectorEndpoints",
    "providerStartup",
    "plan",
    "InspectorQueryError",
    "process",
    `
    const generationId = "test", graphHash = "sha256:test", activationFingerprint = undefined;
    const graph = { nodes: [], edges: [] }, environment = "test", internalEndpointsEnabled = true;
    const runtimeIntegrationsPlan = {}, localServicesInspector = {};
    const telemetryConfiguration = {}, telemetry = { exportCounters: () => ({}), exporterStats: () => [] };
    ${SERVER_RUNTIME_SUPPORT_SOURCE}
    ${source}
  `,
  )(app, installInspectorEndpoints, Promise.resolve(registry), plan, InspectorQueryError, {
    env: { RELKIT_INSPECTOR_SESSION_TOKEN: "fixture-private-token" },
  });
  return app;
}

test("generated host connects event runtime inspection", async () => {
  const response = await application().request("/_relkit/v1/runtime/events?eventId=demo.event", {
    headers: { "x-relkit-inspector-session-token": "fixture-private-token" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    publications: [{ instanceId: "publication" }],
    deliveries: [{ state: "completed" }],
  });
});

test("generated host projects bucket binding features", async () => {
  const response = await application().request("/_relkit/v1/runtime/buckets/demo.bucket", {
    headers: { "x-relkit-inspector-session-token": "fixture-private-token" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    state: {
      id: "demo.bucket",
      capabilities: { signedReadUrl: true, signedWriteUrl: true },
    },
  });
});

test("generated rich APIs reject direct callers without the private bridge credential", async () => {
  expect((await application().request("/_relkit/v1/runtime/events")).status).toBe(401);
});
