/**
 * Event publish and replay from the Inspector in a generated development server, end to end
 * against the local event provider (IN-12, IN-13): the generated inspector registration wires
 * `relkit.events.admin` to the application's own event client, a publication's reaction runs, a
 * replay runs it again with the stored payload, an invalid payload is refused with the failing
 * field, and delivery administration answers by the delivery's state.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "../../packages/relkit/node_modules/hono";
import * as inspectorApi from "../../packages/relkit/src/inspector-api/index.ts";
import { materializeEvents } from "../../packages/relkit/src/engine/materialize-events.ts";
import { defineEvent } from "../../packages/relkit/src/events/define-event.ts";
import { createLocalEventProvider } from "../../packages/relkit/src/providers-local/events/provider.ts";
import { z } from "../../packages/relkit/src/schema/index.ts";
import { inspectorEndpointsSource } from "../../packages/cli/src/commands/build-server-http-inspector.ts";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.ts";

const token = "fixture-private-token";
const identity = { generationId: "test", graphHash: "sha256:test" };
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * Starts a generated inspector over a real local event provider with one durable reaction.
 * @returns The router and the payloads the reaction received.
 */
async function application() {
  const root = await mkdtemp(join(tmpdir(), "relkit-event-actions-"));
  const events = await createLocalEventProvider(root);
  cleanups.push(
    () => rm(root, { recursive: true, force: true }),
    () => events.close(),
  );
  const registry = {
    resolve: (capability: string) => ({
      value: capability === "event" ? events : {},
      binding: { adapter: { features: [] } },
    }),
  };
  const reactions: unknown[] = [];
  const placed = {
    kind: "event",
    id: "orders.placed",
    version: 1,
    profile: "local",
    input: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
  };
  await materializeEvents({
    plan: {
      functions: [{ id: "orders.notify", invocationMode: "event-only" }],
      eventTriggers: [
        {
          id: "orders.notify.placed",
          targetFunctionId: "orders.notify",
          config: {
            eventId: "orders.placed",
            eventVersion: 1,
            delivery: "durable",
            profile: "local",
          },
        },
      ],
      events: [placed],
    },
    providerRegistry: registry,
    engine: { invoke: async (options: { input: unknown }) => void reactions.push(options.input) },
  } as never);
  const orderPlaced = defineEvent({
    id: "orders.placed",
    input: z.object({ orderId: z.string() }),
  });
  const runtimeManifest = {
    functions: { "orders.place": { dependencies: { events: { placed: orderPlaced } } } },
    targets: {},
    services: {},
  };
  const app = new Hono();
  new Function(
    "app",
    "module",
    "providerStartup",
    "plan",
    "runtimeManifest",
    "process",
    `
    const InspectorQueryError = module.InspectorQueryError;
    const generationId = "${identity.generationId}", graphHash = "${identity.graphHash}";
    const activationFingerprint = undefined, graph = { nodes: [], edges: [] };
    const environment = "test", internalEndpointsEnabled = true;
    const runtimeIntegrationsPlan = {}, localServicesInspector = {};
    const telemetryConfiguration = {}, telemetry = { exportCounters: () => ({}), exporterStats: () => [] };
    ${SERVER_RUNTIME_SUPPORT_SOURCE}
    ${inspectorEndpointsSource({ maxPreviewBytes: 1024 } as never).replace("installInspectorEndpoints(app,", "module.installInspectorEndpoints(app,")}
  `,
  )(
    app,
    inspectorApi,
    Promise.resolve(registry),
    { jobs: [], events: [placed], buckets: [], caches: [] },
    runtimeManifest,
    { env: { RELKIT_INSPECTOR_SESSION_TOKEN: token } },
  );
  return { app, reactions };
}

/**
 * Sends one Inspector event action.
 * @param app - Generated inspector router.
 * @param path - Action path below `/actions/events/`.
 * @param body - Action body without the generation identity.
 * @returns The status and parsed body.
 */
async function action(app: Hono, path: string, body: Record<string, unknown>) {
  const response = await app.request(`/_relkit/v1/actions/events/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relkit-inspector-session-token": token },
    body: JSON.stringify({ ...identity, idempotencyKey: crypto.randomUUID(), ...body }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

/**
 * Waits for the durable delivery worker to run the reaction.
 * @param reactions - Payloads received so far.
 * @param count - Expected number of reactions.
 */
async function reactionsReach(reactions: readonly unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 100 && reactions.length < count; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  expect(reactions).toHaveLength(count);
}

test("publish runs the reaction and replay runs it again with the stored payload", async () => {
  const { app, reactions } = await application();
  const published = await action(app, "orders.placed/publish", { input: { orderId: "o-1" } });
  expect(published.status).toBe(200);
  expect(published.body.result).toMatchObject({ eventId: "orders.placed", version: 1 });
  const publicationId = published.body.result.instanceId as string;
  await reactionsReach(reactions, 1);
  expect(reactions[0]).toEqual({ orderId: "o-1" });

  const replayed = await action(app, `${publicationId}/replay`, { reason: "check the reaction" });
  expect(replayed.status).toBe(200);
  expect(replayed.body.result).toMatchObject({ replayOf: publicationId, eventId: "orders.placed" });
  expect(replayed.body.result.instanceId).not.toBe(publicationId);
  await reactionsReach(reactions, 2);
  expect(reactions[1]).toEqual({ orderId: "o-1" });
});

test("an invalid payload is refused with the failing field and nothing is published", async () => {
  const { app, reactions } = await application();
  const refused = await action(app, "orders.placed/publish", { input: { orderId: 42 } });
  expect(refused.status).toBe(422);
  expect(refused.body.error).toBe("RELKIT_EVENT_PAYLOAD_VALIDATION");
  expect(refused.body.cause).toMatchObject({
    status: 422,
    code: "validation",
    issues: [{ path: ["orderId"] }],
  });
  const unknown = await action(app, "orders.unknown/publish", { input: {} });
  expect(unknown.status).toBe(404);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(reactions).toHaveLength(0);
});

test("replay of an unknown publication and retry of an ineligible delivery are refused", async () => {
  const { app, reactions } = await application();
  expect((await action(app, "event-unknown/replay", {})).status).toBe(404);
  await action(app, "orders.placed/publish", { input: { orderId: "o-2" } });
  await reactionsReach(reactions, 1);
  const runtime = await app.request("/_relkit/v1/runtime/events", {
    headers: { "x-relkit-inspector-session-token": token },
  });
  const deliveryId = ((await runtime.json()) as { deliveries: { deliveryId: string }[] })
    .deliveries[0]!.deliveryId;
  // A completed delivery cannot be retried or cancelled; an unknown one is not found.
  expect((await action(app, `${deliveryId}/retry`, {})).status).toBe(409);
  expect((await action(app, `${deliveryId}/cancel`, {})).status).toBe(409);
  expect((await action(app, "delivery-unknown/retry", {})).status).toBe(404);
});
