import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import { preparedRuntimeManifest } from "./src/commands/build-prepared-manifest.js";

const source = `import runtimeActivationFingerprint from "./runtime-activation.json" with { type: "json" };
import { bindDescriptorIdentity as __relkit_bindDescriptorIdentity } from "@relkit/app/internal/runtime";
import * as __relkit_module_0 from "../../relkit.config.ts";
import * as __relkit_module_1 from "../../src/hello/functions/hello.function.ts";
import * as __relkit_module_2 from "../../src/hello/service.ts";
import * as __relkit_module_3 from "../../src/routes/hello/route.ts";

__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "example");
__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "hello.greet");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"], "hello");
__relkit_bindDescriptorIdentity(__relkit_module_2["default"]["hello"], "hello.greet");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"], "route.get.hello");
__relkit_bindDescriptorIdentity(__relkit_module_3["GET"]["target"], "hello.greet");

export const runtimeManifest = {
  functions: { "hello.greet": __relkit_module_1["default"].handler },
  targets: { "hello.greet": __relkit_module_1["default"] },
  routes: { "route.get.hello": __relkit_module_3["GET"] },
  services: { "hello": __relkit_module_2["default"] },
  application: __relkit_module_0["default"],
} as const;
`;

const graph = {
  contractVersion: GRAPH_VERSION,
  nodes: [
    {
      kind: "function",
      id: "hello.greet",
      source: { file: "src/hello/functions/hello.function.ts", line: 1, column: 1 },
      invocationMode: "callable",
      input: {},
      output: {},
    },
    {
      kind: "service",
      id: "hello",
      source: { file: "src/hello/service.ts", line: 1, column: 1 },
      functions: [{ name: "hello", functionId: "hello.greet" }],
      events: [],
    },
    {
      kind: "trigger",
      id: "route.get.hello",
      source: { file: "src/routes/hello/route.ts", line: 1, column: 1 },
      triggerType: "http",
      targetFunctionId: "hello.greet",
      config: { method: "GET", path: "/hello" },
    },
  ],
  edges: [],
} as unknown as ApplicationGraph;

describe("preparedRuntimeManifest", () => {
  it("partitions HTTP-only executable modules behind one single-flight loader", () => {
    const prepared = preparedRuntimeManifest(
      source,
      graph,
      "/project",
      "/project/.relkit/generated",
    );

    expect(prepared).toContain("return module;");
    expect(prepared).toContain(
      'functions: { "hello.greet": (...args) => __relkit_deferred_0().then((module) => module["default"].handler(...args)) },',
    );
    expect(prepared).toContain(
      'targetLoaders: { "hello.greet": () => __relkit_deferred_0().then((module) => module["default"]) },',
    );
    expect(prepared).toContain('__relkit_bindDescriptorIdentity(module["default"], "hello.greet")');
    expect(prepared).toContain("targets: {  },");
    expect(prepared).toContain("routes: {  },");
    expect(prepared).toContain("services: {  },");
    expect(prepared).not.toContain("import * as __relkit_module_1");
    expect(prepared).not.toContain("import * as __relkit_module_2");
    expect(prepared).not.toContain("import * as __relkit_module_3");
  });

  it("does not confuse overlapping generated aliases", () => {
    const overlapping = source
      .replaceAll("__relkit_module_1", "__relkit_module_10")
      .replace(
        'import * as __relkit_module_2 from "../../src/hello/service.ts";',
        'import * as __relkit_module_1 from "../../src/unused.ts";\nimport * as __relkit_module_2 from "../../src/hello/service.ts";',
      )
      .replace(
        '__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "example");',
        '__relkit_bindDescriptorIdentity(__relkit_module_0["default"], "example");\n__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "unused");',
      );
    const prepared = preparedRuntimeManifest(
      overlapping,
      graph,
      "/project",
      "/project/.relkit/generated",
    );
    expect(prepared).not.toBe(overlapping);
    expect(prepared).not.toContain("import * as __relkit_module_10");
    expect(prepared).toContain("import * as __relkit_module_1");
    expect(prepared).toContain(
      '__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "unused")',
    );
  });

  it("preserves distinct targets exported by the same deferred module", () => {
    const multiTargetSource = source
      .replace(
        '__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "hello.greet");',
        '__relkit_bindDescriptorIdentity(__relkit_module_1["default"], "hello.greet");\n__relkit_bindDescriptorIdentity(__relkit_module_1["named"], "hello.named");',
      )
      .replace(
        'functions: { "hello.greet": __relkit_module_1["default"].handler },',
        'functions: { "hello.greet": __relkit_module_1["default"].handler, "hello.named": __relkit_module_1["named"].handler },',
      )
      .replace(
        'targets: { "hello.greet": __relkit_module_1["default"] },',
        'targets: { "hello.greet": __relkit_module_1["default"], "hello.named": __relkit_module_1["named"] },',
      );
    const multiTargetGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          ...graph.nodes[0],
          id: "hello.named",
        },
        {
          ...graph.nodes[2],
          id: "route.get.named",
          targetFunctionId: "hello.named",
        },
      ],
    } as ApplicationGraph;

    const prepared = preparedRuntimeManifest(
      multiTargetSource,
      multiTargetGraph,
      "/project",
      "/project/.relkit/generated",
    );

    expect(prepared).toContain(
      '"hello.greet": () => __relkit_deferred_0().then((module) => module["default"])',
    );
    expect(prepared).toContain(
      '"hello.named": () => __relkit_deferred_0().then((module) => module["named"])',
    );
    expect(prepared.match(/const __relkit_deferred_0 =/gu)).toHaveLength(1);
  });

  it("keeps a function eager when a non-HTTP trigger also owns it", () => {
    const shared = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          kind: "trigger",
          id: "event.hello",
          source: { file: "src/hello/event.ts", line: 1, column: 1 },
          triggerType: "event",
          targetFunctionId: "hello.greet",
          config: {},
        },
      ],
    } as ApplicationGraph;
    expect(preparedRuntimeManifest(source, shared, "/project", "/project/.relkit/generated")).toBe(
      source,
    );
  });

  it("escapes HTML-significant characters in generated import expressions", () => {
    const specifier = "../../src/</script>/hello.function.ts";
    const unsafeSource = source.replace("../../src/hello/functions/hello.function.ts", specifier);
    const unsafeGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "function"
          ? { ...node, source: { ...node.source, file: "src/</script>/hello.function.ts" } }
          : node,
      ),
    } as ApplicationGraph;

    const prepared = preparedRuntimeManifest(
      unsafeSource,
      unsafeGraph,
      "/project",
      "/project/.relkit/generated",
    );

    expect(prepared).not.toContain("</script>");
    expect(prepared).toContain(
      "..\\u002F..\\u002Fsrc\\u002F\\u003C\\u002Fscript\\u003E\\u002Fhello.function.ts",
    );
  });

  it("shares one real module initialization across simultaneous requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-deferred-route-"));
    const counter = "__relkitDeferredRouteInitializations";
    try {
      await writeFile(
        join(directory, "handler.mjs"),
        `globalThis.${counter} = (globalThis.${counter} ?? 0) + 1;
await new Promise((resolve) => setTimeout(resolve, 20));
export default { handler: async (input, context) => ({ input, context, initialized: globalThis.${counter} }) };
`,
      );
      const runtimeSource = `import * as __relkit_module_0 from "./handler.mjs";

export const runtimeManifest = {
  functions: { "hello.greet": __relkit_module_0["default"].handler },
  targets: { "hello.greet": __relkit_module_0["default"] },
  routes: {  },
  services: {  },
  application: {},
};
`;
      const runtimeGraph = {
        ...graph,
        nodes: graph.nodes
          .filter((node) => node.kind !== "service")
          .map((node) =>
            node.kind === "function"
              ? { ...node, source: { ...node.source, file: "handler.mjs" } }
              : node,
          ),
      } as ApplicationGraph;
      await writeFile(
        join(directory, "runtime.ts"),
        preparedRuntimeManifest(runtimeSource, runtimeGraph, directory, directory),
      );
      const loaded = (await import(
        `${pathToFileURL(join(directory, "runtime.ts")).href}?test=1`
      )) as {
        runtimeManifest: {
          functions: Record<string, (...args: any[]) => Promise<unknown>>;
          targetLoaders: Record<string, () => Promise<{ handler: (...args: any[]) => unknown }>>;
        };
      };
      const target = await loaded.runtimeManifest.targetLoaders["hello.greet"]!();
      expect(typeof target.handler).toBe("function");
      const invoke = loaded.runtimeManifest.functions["hello.greet"]!;
      const results = await Promise.all([
        invoke("first", { request: 1 }),
        invoke("second", { request: 2 }),
      ]);

      expect(results).toEqual([
        { input: "first", context: { request: 1 }, initialized: 1 },
        { input: "second", context: { request: 2 }, initialized: 1 },
      ]);
      expect((globalThis as Record<string, unknown>)[counter]).toBe(1);
    } finally {
      delete (globalThis as Record<string, unknown>)[counter];
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("shares a failed import without manufacturing a successful response", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-deferred-route-failure-"));
    const counter = "__relkitDeferredRouteFailures";
    try {
      await writeFile(
        join(directory, "handler.mjs"),
        `globalThis.${counter} = (globalThis.${counter} ?? 0) + 1;
throw new Error("deferred route failed");
`,
      );
      const runtimeSource = `import * as __relkit_module_0 from "./handler.mjs";

export const runtimeManifest = {
  functions: { "hello.greet": __relkit_module_0["default"].handler },
  targets: { "hello.greet": __relkit_module_0["default"] },
  routes: {  },
  services: {  },
  application: {},
};
`;
      const runtimeGraph = {
        ...graph,
        nodes: graph.nodes
          .filter((node) => node.kind !== "service")
          .map((node) =>
            node.kind === "function"
              ? { ...node, source: { ...node.source, file: "handler.mjs" } }
              : node,
          ),
      } as ApplicationGraph;
      await writeFile(
        join(directory, "runtime.ts"),
        preparedRuntimeManifest(runtimeSource, runtimeGraph, directory, directory),
      );
      const loaded = (await import(
        `${pathToFileURL(join(directory, "runtime.ts")).href}?test=2`
      )) as {
        runtimeManifest: { functions: Record<string, (...args: any[]) => Promise<unknown>> };
      };
      const invoke = loaded.runtimeManifest.functions["hello.greet"]!;
      const results = await Promise.allSettled([invoke("first"), invoke("second")]);

      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
      expect(results.map((result) => (result as PromiseRejectedResult).reason.message)).toEqual([
        "deferred route failed",
        "deferred route failed",
      ]);
      expect((globalThis as Record<string, unknown>)[counter]).toBe(1);
    } finally {
      delete (globalThis as Record<string, unknown>)[counter];
      await rm(directory, { recursive: true, force: true });
    }
  });
});
