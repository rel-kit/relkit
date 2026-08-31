import { expect, test } from "bun:test";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "../../packages/contracts/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import {
  createFunctionRegistry,
  invoke,
  type InvocationTarget,
} from "../../packages/engine/src/index.ts";
import {
  bindFunctionEvents,
  defineEvent,
  defineEventFunction,
  isEventFunctionDescriptor,
} from "../../packages/events/src/index.ts";
import { defineFunction } from "../../packages/functions/src/index.ts";
import {
  createRegistrationPlan,
  hashGraph,
  type ApplicationGraph,
} from "../../packages/graph/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import {
  bindDescriptorIdentity,
  getDescriptorIdentity,
} from "../../packages/invocation/dist/index.js";
import {
  createTestRuntime,
  invokeFunction as invokeTestFunction,
} from "../../packages/testing/src/index.ts";

const event = defineEvent({ id: "created", input: z.object({ id: z.string() }) });
const consumer = defineEventFunction({
  id: "reaction",
  event: "created" as never,
  handler: () => {},
});
const target = bindFunctionEvents(consumer, event, []) as unknown as InvocationTarget;
const graph = normalizeCompilation({ descriptors: [event, consumer] }).graph! as ApplicationGraph;
const manifest = {
  contractVersion: MANIFEST_VERSION,
  generatorVersion: GENERATOR_VERSION,
  graphHash: hashGraph(graph),
  functions: { reaction: consumer.handler },
  targets: { reaction: target },
};

test("event binding and registration preserve inferred function identities", () => {
  const inferred = defineFunction({
    input: z.unknown(),
    output: z.void(),
    publishes: ["created" as never],
    handler: () => {},
  });
  bindDescriptorIdentity(inferred, "inferred");
  const bound = bindFunctionEvents(inferred, undefined, [event]);
  expect(getDescriptorIdentity(bound)).toBe("inferred");
  const graph = normalizeCompilation({
    descriptors: [
      event,
      { ...inferred, id: "inferred", ref: { kind: "function", id: "inferred" } },
    ],
  }).graph! as ApplicationGraph;
  const registry = createFunctionRegistry(graph, {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: hashGraph(graph),
    functions: { inferred: inferred.handler },
    targets: { inferred: bound },
  });
  expect(getDescriptorIdentity(registry.targets.inferred!)).toBe("inferred");
});

test("the test runtime resolves publication contracts for direct and nested calls", async () => {
  const publisher = defineFunction({
    id: "publisher",
    input: z.object({ id: z.string() }),
    output: z.void(),
    publishes: ["created" as never],
    handler: async (input, context) => {
      const events = context.events as Record<
        string,
        { publish: (input: unknown) => Promise<unknown> }
      >;
      await events.created!.publish(input);
    },
  });
  const caller = defineFunction({
    id: "caller",
    input: publisher.input,
    output: z.void(),
    handler: (input) => publisher.invoke(input),
  });
  const publicationGraph = normalizeCompilation({ descriptors: [event, publisher, caller] })
    .graph! as ApplicationGraph;
  const registry = createFunctionRegistry(publicationGraph, {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: hashGraph(publicationGraph),
    functions: { publisher: publisher.handler as never, caller: caller.handler as never },
    targets: { publisher: bindFunctionEvents(publisher, undefined, [event]), caller },
  });
  const runtime = createTestRuntime({ registry });
  const published: unknown[] = [];
  runtime.fakes.setClient("events", "created", {
    publish: async (input: unknown) => {
      published.push(input);
      return { accepted: true, instanceId: "test-event" };
    },
  });
  try {
    await expect(
      invokeTestFunction(publisher, { id: "fake" }, { registry }),
    ).resolves.toBeUndefined();
    await runtime.invoke(publisher, { id: "direct" });
    await runtime.invoke(caller, { id: "nested" });
    expect(published).toEqual([{ id: "direct" }, { id: "nested" }]);
  } finally {
    await runtime.close();
  }
});

test("the registry is authoritative even when a callable target is forged", async () => {
  const registry = createFunctionRegistry(graph, manifest);
  const forged = {
    ...target,
    invocationMode: "callable" as const,
    handler: () => {
      throw new Error("must not execute");
    },
  };
  for (const source of ["direct", "http", "job", "tool", "agent"] as const) {
    await expect(invoke({ target: forged, registry, source, input: { id: "1" } })).rejects.toThrow(
      "Event-only",
    );
    await expect(
      invoke({ functionId: "reaction", registry, source, input: { id: "1" } }),
    ).rejects.toThrow("Event-only");
  }
  await expect(
    invoke({ target: forged, registry, source: "event-delivery", input: { id: "1" } }),
  ).resolves.toBeUndefined();
  expect(() =>
    createFunctionRegistry(graph, { ...manifest, targets: { reaction: forged } }),
  ).toThrow("event-only executable target");
  expect(isEventFunctionDescriptor(consumer)).toBe(true);
  expect(isEventFunctionDescriptor({ ...consumer, invoke: () => {} })).toBe(false);
});

test("borrowed invocation and tool methods cannot turn an event function into a callable", async () => {
  const callable = defineFunction({
    id: "caller",
    input: z.unknown(),
    output: z.void(),
    handler: () => {},
  });
  expect(() => callable.invoke.call(consumer as never, {})).toThrow("Event-only");
  expect(() =>
    callable.asTool.call(consumer as never, {
      id: "forged_tool",
      description: "invalid",
      sideEffect: "read",
      approval: "never",
    }),
  ).toThrow("Event-only");
  const nested = defineFunction({
    id: "nested",
    input: z.unknown(),
    output: z.void(),
    handler: () => callable.invoke.call(consumer as never, {}),
  });
  await expect(invoke({ target: nested, input: {} })).rejects.toBeDefined();
});

test("registration rejects event-only routes, services, jobs, schedules, tools, and agents", () => {
  const source = { file: "invalid.ts", line: 1, column: 1 };
  for (const extra of [
    { kind: "trigger", triggerType: "http", targetFunctionId: "reaction", config: {} },
    { kind: "trigger", triggerType: "schedule", targetFunctionId: "reaction", config: {} },
    { kind: "job", targetFunctionId: "reaction", input: {}, profile: "default" },
    { kind: "tool", targetFunctionId: "reaction" },
    { kind: "agent", toolIds: ["reaction"] },
    { kind: "service", functions: [{ name: "reaction", functionId: "reaction" }], events: [] },
  ]) {
    const invalid = {
      ...graph,
      nodes: [...graph.nodes, { ...extra, id: "invalid", source }],
    } as ApplicationGraph;
    expect(() => createRegistrationPlan(invalid)).toThrow(
      'cannot target event-only function "reaction"',
    );
  }
  for (const kind of ["calls-function", "exposes-function", "targets-function"] as const) {
    expect(() =>
      createRegistrationPlan({
        ...graph,
        edges: [...graph.edges, { kind, from: "forged", to: "reaction" }],
      }),
    ).toThrow("event-only");
  }
});

test("successful non-void values fail even when the output schema is forged", async () => {
  await expect(
    invoke({
      target: { ...target, output: z.unknown(), handler: () => 42 },
      source: "event-delivery",
      input: { id: "1" },
    }),
  ).rejects.toBeDefined();
  await expect(
    invoke({
      target: { ...target, onAfter: () => 42 },
      source: "event-replay",
      input: { id: "1" },
    }),
  ).rejects.toBeDefined();
});

test("forged publication bindings cannot bypass the authored capability", async () => {
  await expect(
    invoke({
      target: { ...target, publications: { created: event } },
      source: "event-delivery",
      input: { id: "1" },
    }),
  ).rejects.toThrow('undeclared publication "created"');
});
