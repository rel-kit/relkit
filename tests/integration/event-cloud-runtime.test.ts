import { expect, test } from "bun:test";
import { createEventBridgeProvider } from "../../packages/cloud-aws/src/runtime/events.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import {
  invoke,
  materializeEvents,
  type InvocationTarget,
} from "../../packages/engine/src/index.ts";
import {
  bindFunctionEvents,
  createEventClient,
  defineEvent,
  defineEventFunction,
} from "../../packages/events/src/index.ts";
import { createRegistrationPlan, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

test("EventBridge keeps the published envelope and delivery/replay metadata", async () => {
  const requests: Array<{ Entries: Array<{ Detail: string }> }> = [];
  let rejected = false;
  const provider = createEventBridgeProvider({
    region: "us-east-1",
    busName: "test",
    fetch: (async (_, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json(
        rejected
          ? { FailedEntryCount: 1, Entries: [{ ErrorCode: "InternalFailure" }] }
          : { FailedEntryCount: 0, Entries: [{ EventId: "aws-accepted-id" }] },
      );
    }) as typeof fetch,
  });
  const event = defineEvent({ id: "created", input: z.object({ id: z.string() }) });
  const seen: unknown[] = [];
  const consumer = defineEventFunction({
    id: "react",
    event: "created" as never,
    handler: (input, context) => {
      seen.push(input, context.trigger);
    },
  });
  const target = bindFunctionEvents(consumer, event, []) as unknown as InvocationTarget;
  const graph = normalizeCompilation({ descriptors: [event, consumer] }).graph! as ApplicationGraph;
  await materializeEvents({
    plan: createRegistrationPlan(graph),
    eventProviders: { default: provider },
    engine: { invoke: (options) => invoke({ ...options, target }) },
  });
  const client = createEventClient({
    ownerId: "publisher",
    eventId: event.id,
    version: event.version,
    payloadSchema: event.input,
    source: provider,
    correlationId: "correlation",
    causationInvocationId: "parent",
    traceId: "trace",
  });
  const receipt = await client.publish({ id: "1" });
  const envelope = JSON.parse(requests[0]!.Entries[0]!.Detail);
  expect(envelope).toMatchObject({
    instanceId: receipt.instanceId,
    occurredAt: receipt.occurredAt,
    publishedAt: receipt.publishedAt,
    payload: { id: "1" },
    attributes: {},
  });
  await provider.deliver("relkit.event.react.trigger", envelope, { attempt: 2, replayed: true });
  expect(seen).toEqual([
    { id: "1" },
    expect.objectContaining({
      event: expect.objectContaining({ instanceId: receipt.instanceId }),
      delivery: { attempt: 2, replayed: true },
      trace: { traceId: "trace", correlationId: "correlation", causationInvocationId: "parent" },
    }),
  ]);
  await expect(
    provider.deliver("relkit.event.react.trigger", { ...envelope, payload: { id: 1 } }),
  ).rejects.toBeDefined();
  await expect(client.publish({ id: 1 } as never)).rejects.toBeDefined();
  expect(requests).toHaveLength(1);
  rejected = true;
  await expect(client.publish({ id: "2" })).rejects.toThrow("EventBridge rejected");
});
