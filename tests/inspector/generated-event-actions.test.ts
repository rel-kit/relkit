/**
 * Event publish and replay from the Inspector in a generated development server, end to end
 * against the local event provider (IN-12, IN-13): the generated inspector registration wires
 * `relkit.events.admin` to the application's own event client, a publication's reaction runs, a
 * replay runs it again with the stored payload, an invalid payload is refused with the failing
 * field, and delivery administration answers by the delivery's state. The local provider retries a
 * dead-lettered delivery, cancels a scheduled one, replays a publication as a new delivery of the
 * same publication (source `event-replay`), and reports the total and per-state counts (15.7,
 * IN-13, IN-14).
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
import { applicationFailure } from "../../packages/relkit/src/runtime-effect/index.ts";
import { inspectorEndpointsSource } from "../../packages/cli/src/commands/build-server-http-inspector.ts";
import { SERVER_RUNTIME_SUPPORT_SOURCE } from "../../packages/cli/src/commands/build-server-runtime-support.ts";

const token = "fixture-private-token";
const identity = { generationId: "test", graphHash: "sha256:test" };
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** How the reaction behaves: its retry policy, and whether it fails for now. */
interface ReactionOptions {
  readonly retry?: { readonly maxAttempts: number; readonly initialDelayMs: number };
  readonly failing?: { value: boolean };
}

/**
 * Starts a generated inspector over a real local event provider with one durable reaction.
 * @param options - Retry policy and failure switch of the reaction.
 * @returns The router, the payloads the reaction received and the source of each invocation.
 */
async function application(options: ReactionOptions = {}) {
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
  const sources: { readonly source: unknown; readonly instanceId: unknown }[] = [];
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
            ...(options.retry === undefined
              ? {}
              : {
                  retry: {
                    ...options.retry,
                    maxDelayMs: Math.max(options.retry.initialDelayMs, 1),
                    multiplier: 1,
                    jitter: "none",
                  },
                }),
          },
        },
      ],
      events: [placed],
    },
    providerRegistry: registry,
    engine: {
      invoke: async (invocation: {
        input: unknown;
        source: unknown;
        trigger: { event: { instanceId: unknown } };
      }) => {
        sources.push({
          source: invocation.source,
          instanceId: invocation.trigger.event.instanceId,
        });
        // A declared failure the reaction asks to retry later; a plain throw is never retried.
        if (options.failing?.value)
          throw applicationFailure({
            id: "orders.unavailable",
            message: "Try again later",
            data: {},
            retry: "later",
          });
        reactions.push(invocation.input);
      },
    },
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
  return { app, reactions, sources };
}

/**
 * Reads the generated runtime events page.
 * @param app - Generated inspector router.
 * @returns The page body.
 */
async function eventsPage(app: Hono): Promise<Record<string, any>> {
  const response = await app.request("/_relkit/v1/runtime/events", {
    headers: { "x-relkit-inspector-session-token": token },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, any>;
}

/**
 * Waits until the only delivery of a page reaches a state.
 * @param app - Generated inspector router.
 * @param state - Expected delivery state.
 * @returns The page body once the first delivery is in that state.
 */
async function deliveryReaches(app: Hono, state: string): Promise<Record<string, any>> {
  let page = await eventsPage(app);
  for (let attempt = 0; attempt < 100 && page.deliveries[0]?.state !== state; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    page = await eventsPage(app);
  }
  expect(page.deliveries[0]?.state).toBe(state);
  return page;
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
  const { app, reactions, sources } = await application();
  const published = await action(app, "orders.placed/publish", { input: { orderId: "o-1" } });
  expect(published.status).toBe(200);
  expect(published.body.result).toMatchObject({ eventId: "orders.placed", version: 1 });
  const publicationId = published.body.result.instanceId as string;
  await reactionsReach(reactions, 1);
  expect(reactions[0]).toEqual({ orderId: "o-1" });

  const replayed = await action(app, `${publicationId}/replay`, { reason: "check the reaction" });
  expect(replayed.status).toBe(200);
  // A replay delivers the same publication again; nothing is published anew.
  expect(replayed.body.result).toMatchObject({
    replayOf: publicationId,
    eventId: "orders.placed",
    instanceId: publicationId,
  });
  await reactionsReach(reactions, 2);
  expect(reactions[1]).toEqual({ orderId: "o-1" });
  expect(sources).toEqual([
    { source: "event-delivery", instanceId: publicationId },
    { source: "event-replay", instanceId: publicationId },
  ]);
  const page = await eventsPage(app);
  expect(page.publications).toHaveLength(1);
  expect(page.deliveries).toHaveLength(2);
  expect(page.total).toBe(2);
  expect(page.counts).toEqual({ completed: 2 });
});

test("a dead-lettered delivery is retried and completes; the counts follow", async () => {
  const failing = { value: true };
  const { app, reactions } = await application({
    retry: { maxAttempts: 1, initialDelayMs: 0 },
    failing,
  });
  await action(app, "orders.placed/publish", { input: { orderId: "o-3" } });
  const dead = await deliveryReaches(app, "dead-lettered");
  expect(dead.total).toBe(1);
  expect(dead.counts).toEqual({ "dead-lettered": 1 });
  failing.value = false;
  const deliveryId = dead.deliveries[0].deliveryId as string;
  const retried = await action(app, `${deliveryId}/retry`, { reason: "fixed the handler" });
  expect(retried.status).toBe(200);
  await reactionsReach(reactions, 1);
  const done = await deliveryReaches(app, "completed");
  expect(done.counts).toEqual({ completed: 1 });
});

test("a scheduled delivery is cancelled and never runs", async () => {
  const failing = { value: true };
  const { app, sources } = await application({
    retry: { maxAttempts: 3, initialDelayMs: 600_000 },
    failing,
  });
  await action(app, "orders.placed/publish", { input: { orderId: "o-4" } });
  const delayed = await deliveryReaches(app, "delayed");
  const deliveryId = delayed.deliveries[0].deliveryId as string;
  failing.value = false;
  const cancelled = await action(app, `${deliveryId}/cancel`, { reason: "not needed" });
  expect(cancelled.status).toBe(200);
  const page = await deliveryReaches(app, "dead-lettered");
  expect(page.deliveries[0].failure).toMatchObject({ outcome: "cancelled" });
  expect(page.counts).toEqual({ "dead-lettered": 1 });
  // Cancelled once, it cannot be cancelled again.
  expect((await action(app, `${deliveryId}/cancel`, {})).status).toBe(409);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(sources).toHaveLength(1);
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
