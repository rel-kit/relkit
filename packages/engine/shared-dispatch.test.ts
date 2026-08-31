import { expect, test } from "bun:test";
import {
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  type ProtocolId,
} from "@relkit/contracts";
import { dispatchInvocation } from "@relkit/invocation";
import { defineFunction } from "@relkit/app";
import { hashGraph, type ApplicationGraph } from "@relkit/graph";
import { z } from "@relkit/schema";
import { createFunctionRegistry } from "./src/registry.ts";
import {
  createInspectableObservabilityHooks,
  invokeFunction,
  type InvocationTarget,
} from "./src/index.ts";

const source = { file: "src/functions.ts", line: 1, column: 1 } as const;
const input = z.number();
const output = z.number();

test("engine dispatch uses the verified generation registry in its shared scope", async () => {
  const child: InvocationTarget<number, number> = {
    id: "orders.child",
    input,
    output,
    handler: () => -1,
  };
  const parent: InvocationTarget<number, number> = {
    id: "orders.parent",
    input,
    output,
    handler: (_value, _context) => dispatchInvocation({ target: child, input: 1 }),
  };
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: parent.id,
        source,
        input: null,
        output: null,
      },
      {
        kind: "function",
        invocationMode: "callable",
        id: child.id,
        source,
        input: null,
        output: null,
      },
    ],
    edges: [],
  };
  const registry = createFunctionRegistry(graph, {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: hashGraph(graph),
    functions: {
      [parent.id]: parent.handler,
      [child.id]: (value: number) => value + 1,
    },
  });
  const records: Array<{ id: string; functionId: string; parentId?: string; traceId: string }> = [];
  let sequence = 0;
  let admissionCount = 0;
  const idSource = {
    next: (kind: "trace" | "invocation" | "span") => `${kind}-${++sequence}` as ProtocolId,
  };

  await expect(
    invokeFunction(parent, 1, {
      idSource,
      registry,
      admit: () => {
        admissionCount += 1;
        return { release: () => undefined };
      },
      hooks: { onInvocationStart: (record) => records.push(record) },
    }),
  ).resolves.toBe(2);

  expect(records).toHaveLength(2);
  expect(records[1]).toMatchObject({
    functionId: "orders.child",
    parentId: records[0]?.id,
    traceId: records[0]?.traceId,
  });
  expect(admissionCount).toBe(2);
});

test("function invoke uses standalone and active generation dispatch", async () => {
  const child = defineFunction({
    id: "orders.descriptor-child",
    input,
    output,
    handler: () => -1,
  });
  const parent = defineFunction({
    id: "orders.descriptor-parent",
    input,
    output,
    handler: () => child.invoke(1),
  });

  expect(Object.keys(child)).not.toContain("invoke");
  expect(Object.getOwnPropertyDescriptor(child, "invoke")).toMatchObject({
    enumerable: false,
    writable: false,
    configurable: false,
  });
  expect(Object.isFrozen(child)).toBe(true);
  await expect(child.invoke(1)).resolves.toBe(-1);

  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: parent.id,
        source,
        input: null,
        output: null,
      },
      {
        kind: "function",
        invocationMode: "callable",
        id: child.id,
        source,
        input: null,
        output: null,
      },
    ],
    edges: [],
  };
  const registry = createFunctionRegistry(graph, {
    contractVersion: MANIFEST_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphHash: hashGraph(graph),
    functions: {
      [parent.id]: parent.handler,
      [child.id]: (value: number) => value + 1,
    },
  });
  const graphHash = hashGraph(graph);
  const hooks = createInspectableObservabilityHooks();

  await expect(
    invokeFunction(parent, 1, { registry, hooks: { observability: hooks } }),
  ).resolves.toBe(2);

  const starts = hooks.read().filter((event) => event.type === "invocation.started");
  const parentStart = starts.find((event) => event.record.functionId === parent.id)?.record;
  const childStart = starts.find((event) => event.record.functionId === child.id)?.record;
  expect(childStart).toMatchObject({
    parentId: parentStart?.id,
    traceId: parentStart?.traceId,
  });
  expect(hooks.read().filter((event) => event.type === "edge.observed")).toMatchObject([
    {
      type: "edge.observed",
      edge: { relationship: "calls-function", from: parent.id, to: child.id },
    },
  ]);
  expect(graph.edges).toEqual([]);
  expect(hashGraph(graph)).toBe(graphHash);
});

test("keeps concurrent generation runtimes isolated", async () => {
  let started = 0;
  let release!: () => void;
  let bothStarted!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const ready = new Promise<void>((resolve) => (bothStarted = resolve));
  const child = defineFunction({
    id: "orders.concurrent-child",
    input,
    output,
    handler: () => -1,
  });
  const parent = defineFunction({
    id: "orders.concurrent-parent",
    input,
    output,
    handler: async () => {
      started += 1;
      if (started === 2) bothStarted();
      await gate;
      return child.invoke(1);
    },
  });
  const graph: ApplicationGraph = {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: parent.id,
        source,
        input: null,
        output: null,
      },
      {
        kind: "function",
        invocationMode: "callable",
        id: child.id,
        source,
        input: null,
        output: null,
      },
    ],
    edges: [],
  };
  const graphHash = hashGraph(graph);
  const registry = (value: number) =>
    createFunctionRegistry(graph, {
      contractVersion: MANIFEST_VERSION,
      generatorVersion: GENERATOR_VERSION,
      graphHash,
      functions: {
        [parent.id]: parent.handler,
        [child.id]: () => value,
      },
    });
  const idSource = (prefix: string) => {
    let sequence = 0;
    return {
      next: (kind: "trace" | "invocation" | "span") =>
        `${prefix}-${kind}-${++sequence}` as ProtocolId,
    };
  };

  const first = invokeFunction(parent, 1, { registry: registry(11), idSource: idSource("first") });
  const second = invokeFunction(parent, 1, {
    registry: registry(22),
    idSource: idSource("second"),
  });
  await bothStarted;
  release();

  expect(await Promise.all([first, second])).toEqual([11, 22]);
});
