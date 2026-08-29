import { defineConfig, defineService } from "@relkit/app";
import { defineAgent } from "@relkit/agents";
import { defineBucket } from "@relkit/buckets";
import { defineCache } from "@relkit/cache";
import { defineEnv, env, type EnvRef } from "@relkit/config";
import {
  defineEvent,
  events,
  onEvent,
  type EventEnvelope,
  type EventSelectorInput,
  type UnknownEventEnvelope,
} from "@relkit/events";
import { defineError, defineFunction } from "@relkit/functions";
import { defineJob } from "@relkit/jobs";
import { defineRoute, http } from "@relkit/routes";
import { z, type InferInput, type InferOutput } from "@relkit/schema";
import { defineTool } from "@relkit/tools";

const input = z.object({ id: z.string() });
const output = z.object({ ok: z.boolean() });
const declared = defineError({
  id: "types.invalid-order",
  data: z.object({ reason: z.string() }),
  message: ({ reason }) => reason,
  retry: "never",
});
const child = defineFunction({
  id: "types.child",
  input,
  output,
  handler: async () => ({ ok: true }),
});
const createdPayload = z.object({ orderId: z.string() });
const changedPayload = z.object({ orderId: z.string(), state: z.string() });
export const eventCreated = defineEvent({
  id: "types.created",
  version: 1,
  payload: createdPayload,
});
export const eventChanged = defineEvent({
  id: "types.changed",
  version: 2,
  payload: changedPayload,
});
const createdEnvelope = z.object({
  instanceId: z.string(),
  eventId: z.literal("types.created"),
  version: z.literal(1),
  payload: createdPayload,
  occurredAt: z.string(),
  publishedAt: z.string(),
  traceId: z.string(),
  attributes: z.object({}),
});
const changedEnvelope = z.object({
  instanceId: z.string(),
  eventId: z.literal("types.changed"),
  version: z.literal(2),
  payload: changedPayload,
  occurredAt: z.string(),
  publishedAt: z.string(),
  traceId: z.string(),
  attributes: z.object({}),
});
const anyEnvelope = z.union([createdEnvelope, changedEnvelope]);
const singleEnvelopeTarget = defineFunction({
  id: "types.single-envelope",
  input: createdEnvelope,
  output,
  handler: async (value) => {
    const envelope: EventEnvelope<"types.created", 1, { orderId: string }> = value;
    const eventId: "types.created" = value.eventId;
    const version: 1 = value.version;
    void envelope;
    void eventId;
    void version;
    return { ok: true };
  },
});
const unionEnvelopeTarget = defineFunction({
  id: "types.union-envelope",
  input: anyEnvelope,
  output,
  handler: async (value) => {
    if (value.eventId === "types.created") {
      const version: 1 = value.version;
      const orderId: string = value.payload.orderId;
      void version;
      void orderId;
    } else {
      const version: 2 = value.version;
      const state: string = value.payload.state;
      void version;
      void state;
    }
    return { ok: true };
  },
});
const job = defineJob({
  id: "types.job",
  input,
  target: child,
  retry: { maxAttempts: 2, initialDelayMs: 0, maxDelayMs: 0, multiplier: 1, jitter: "none" },
});
const bucket = defineBucket({ id: "types.bucket", visibility: "private" });
const cache = defineCache({
  id: "types.cache",
  key: z.object({ sku: z.string() }),
  value: z.object({ price: z.number() }),
});
const numericCache = defineCache({
  id: "types.numeric-cache",
  key: z.string(),
  value: z.number(),
});
const tool = defineTool({
  id: "types.tool",
  target: child,
  description: "Read an order",
  sideEffect: "read",
  approval: "never",
});
const agent = defineAgent({
  id: "types.agent",
  input: z.object({ prompt: z.string() }),
  output: z.object({ answer: z.string() }),
  model: "default",
  instructions: "Answer",
  tools: [tool],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
});

const parent = defineFunction({
  id: "types.parent",
  input,
  output,
  dependencies: {
    jobs: { job },
    events: { created: eventCreated },
    buckets: { bucket },
    cache: { cache, numericCache },
    agents: { agent },
  },
  handler: async (value, context) => {
    const childResult: InferOutput<typeof output> = await child.invoke({ id: value.id });
    const queued = await context.jobs.job.enqueue({ id: value.id });
    const published = await context.events.created.publish({ orderId: value.id });
    const object = await context.buckets.bucket.get("orders/1");
    const cached: { price: number } | undefined = await context.cache.cache.get({ sku: value.id });
    // @ts-expect-error increment is not exposed for object-valued caches
    await context.cache.cache.increment({ sku: value.id });
    const count: number = await context.cache.numericCache.increment(value.id);
    const assisted: { answer: string } = await context.agents.agent({ prompt: value.id });
    void childResult;
    void queued;
    void published;
    void object;
    void cached;
    void count;
    void assisted;
    return { ok: true };
  },
});

const routeRequest = http.input({ id: http.path("id"), limit: http.query("limit") });
const route = defineRoute({
  id: "types.route",
  target: parent,
  request: routeRequest,
  responses: [http.success(200, output)],
});
const mapped: { id: string; limit: string } = {
  id: "order-1",
  limit: "10",
};
void route;
void mapped;

const selector = events.anyOf("types.created", "types.changed");
const selected: EventSelectorInput<typeof selector> = {
  instanceId: "event-1",
  eventId: "types.created",
  version: 1,
  payload: { orderId: "order-1" },
  occurredAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  traceId: "trace-1",
  attributes: {},
};
void selected;
function assertSelectedEnvelope(value: EventSelectorInput<typeof selector>): void {
  if (value.eventId === "types.created") {
    const version: 1 = value.version;
    const orderId: string = value.payload.orderId;
    void version;
    void orderId;
  } else {
    const version: 2 = value.version;
    const state: string = value.payload.state;
    void version;
    void state;
  }
}
assertSelectedEnvelope(selected);
const invalidSelected: EventSelectorInput<typeof selector> = {
  ...selected,
  // @ts-expect-error the selector union rejects an unknown event ID
  eventId: "types.unknown",
};
void invalidSelected;

const singleTrigger = onEvent(
  "types.created",
  async (payload, context) => {
    const orderId: string = payload.orderId;
    const eventId: string = context.event.eventId;
    void orderId;
    void eventId;
  },
  { id: "types.single-trigger" },
);
const anyTrigger = onEvent(
  selector,
  async (envelope) => {
    assertSelectedEnvelope(envelope);
  },
  { id: "types.any-trigger" },
);
const matchTrigger = onEvent(
  events.match("types.*"),
  async (envelope) => {
    assertSelectedEnvelope(envelope);
  },
  { id: "types.match-trigger" },
);
const rawSelector = events.all({ payload: "unknown", purpose: "telemetry" });
const rawEnvelope: UnknownEventEnvelope = {
  instanceId: "event-raw",
  eventId: "types.any",
  version: 1,
  payload: { orderId: "order-1" },
  occurredAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  traceId: "trace-raw",
  attributes: {},
};
const rawInput: EventSelectorInput<typeof rawSelector> = rawEnvelope;
const rawTarget = defineFunction({
  id: "types.raw-envelope",
  input: z.object({
    instanceId: z.string(),
    eventId: z.string(),
    version: z.number(),
    payload: z.unknown(),
    occurredAt: z.string(),
    publishedAt: z.string(),
    traceId: z.string(),
    attributes: z.object({}),
  }),
  output,
  handler: async (value) => {
    const payload: unknown = value.payload;
    void payload;
    return { ok: true };
  },
});
const rawTrigger = onEvent(
  rawSelector,
  async (envelope) => {
    const payload: unknown = envelope.payload;
    void payload;
  },
  { id: "types.raw-trigger", delivery: "ephemeral" },
);
void singleTrigger;
void anyTrigger;
void matchTrigger;
void rawInput;
void rawTrigger;

const trigger = onEvent(
  "types.created",
  async (payload, context) => {
    const orderId: string = payload.orderId;
    const result: { ok: boolean } = await child.invoke({ id: orderId });
    void result;
  },
  { id: "types.trigger" },
);
// @ts-expect-error event names come from the generated registry
onEvent("types.missing", async () => undefined);
const triggerKind: "event-trigger" = trigger.kind;
void triggerKind;

const environment = defineEnv({
  AWS_REGION: env.string(),
  API_KEY: env.secret(),
});
const region: EnvRef<"AWS_REGION", string> = environment.AWS_REGION;
const app = defineConfig({
  id: "types.app",
  env: environment,
});
void region;
void app;

const error = declared.create({ reason: "bad" });
const errorInput: InferInput<typeof declared.data> = { reason: "bad" };
void error;
void errorInput;
const toolInput: InferInput<typeof tool.target.input> = { id: "order-1" };
const toolOutput: InferOutput<typeof tool.target.output> = { ok: true };
void toolInput;
void toolOutput;

const service = defineService({
  id: "types.orders",
  functions: { lookup: child },
});
const serviceInput: Parameters<typeof service.lookup.invoke>[0] = { id: "order-1" };
const serviceOutput: Promise<InferOutput<typeof child.output>> =
  service.lookup.invoke(serviceInput);
const serviceTool = service.lookup.asTool({
  id: "types.orders.lookup-tool",
  description: "Look up an order",
  sideEffect: "read",
  approval: "never",
});
const serviceToolOutput: Promise<InferOutput<typeof child.output>> = serviceTool.invoke({
  id: "order-1",
});
const directToolOutput: Promise<InferOutput<typeof child.output>> = tool.invoke({ id: "order-1" });
const originalMember: typeof child = service.lookup;
void serviceOutput;
void serviceToolOutput;
void directToolOutput;
void originalMember;

// @ts-expect-error service members must be function descriptors
defineService({ id: "types.invalid-service-member", functions: { broken: {} } });
// @ts-expect-error zero-argument asTool requires complete function tool metadata
child.asTool();
// @ts-expect-error service member invoke uses the original function input
service.lookup.invoke({ orderId: "order-1" });
// @ts-expect-error direct service members are immutable
service.lookup = child;
