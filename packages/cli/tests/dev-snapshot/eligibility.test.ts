/**
 * Proves conservative static eligibility without executing submitted source.
 * Generated literals and runtime handlers qualify; ambient reads, construction
 * callbacks, escaped imports and altered discovery configuration must fall back.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { verifyStaticSnapshotSource } from "../../src/dev-snapshot/snapshot-eligibility.js";
import { SnapshotEligibleTsConfig } from "../../src/dev-snapshot/snapshot-eligibility.schemas.js";

it.effect("accepts generated symbolic environment, aliases and deferred runtime handlers", () =>
  Effect.gen(function* () {
    const sources = [
      'import { defineEnv, env } from "@relkit/app/config"; export default defineEnv({ LOG_LEVEL: env.literal("info", "debug").default("info") });',
      'import { defineFunction as fn } from "@relkit/app/functions"; import { z } from "@relkit/app/schema"; const hello = fn({ id: "hello", input: z.object({name:z.string().min(1)}), output:z.string(), handler: async () => process.env.RUNTIME_VALUE }); export default hello;',
      'import { defineRoute } from "@relkit/app/routes"; import hello from "@app/hello/service.js"; export const GET = defineRoute({ target: hello.hello });',
      'import { defineApp } from "@relkit/app/config"; import env from "@app/platform/env.js"; export default defineApp({env, server: {port:3000}, inspector: {port:3210}});',
      'import { defineServiceRoutes } from "@relkit/app/routes"; import orders from "@app/orders/service.js"; export const { POST } = defineServiceRoutes(orders, { POST: { member: "create" } });',
      'import { defineTask } from "@relkit/app/tasks"; import { z } from "@relkit/app/schema"; export default defineTask({ id: "orders.export", execution: "durable", input: z.string(), output: z.string(), handler: async (value) => value });',
      'import { defineJob } from "@relkit/app/jobs"; import task from "@app/orders/export.task.js"; export default defineJob({ id: "orders.job", name: "orders", task });',
      'import { defineApp } from "@relkit/app/config"; import { localAgentState, localRealtime } from "@relkit/local"; export default defineApp({ realtime: localRealtime(), "agent-state": localAgentState(), defaults: { realtime: "default", "agent-state": "default" } });',
      'import hello from "@app/hello/function.js"; export default hello.asTool({ id: "hello.lookup", description: "Lookup", sideEffect: "read", approval: "never", timeoutMs: 2000 });',
      'import { defineAgent } from "@relkit/app/agents"; import { z } from "@relkit/app/schema"; import { FakeToolCallingModel, todoListMiddleware, tool } from "langchain"; const uppercase = tool(async ({ text }) => text, { name: "uppercase", description: "Uppercase", schema: z.object({ text: z.string() }) }); export default defineAgent({ id: "hello.assistant", input: z.string(), output: z.string(), model: new FakeToolCallingModel({ toolCalls: [] }), tools: [uppercase], middleware: [todoListMiddleware()], handler: async (value) => value });',
      'import { defineGraph, defineGraphNode } from "@relkit/app/agents"; import { z } from "@relkit/app/schema"; import { END, MemorySaver, START, StateSchema, interrupt } from "@langchain/langgraph"; const state = new StateSchema({ request: z.string() }); const review = defineGraphNode({ id: "review", input: z.string(), output: z.string(), handler: () => interrupt("review") }); export default defineGraph({ id: "hello.review", state, input: z.string(), output: z.string(), nodes: [review], edges: (graph) => graph.addEdge(START, END), checkpointer: new MemorySaver() });',
    ];
    for (const source of sources)
      expect(
        Exit.isSuccess(yield* Effect.exit(verifyStaticSnapshotSource(source, "src/route.ts"))),
        source,
      ).toBe(true);
  }),
);

it.effect("limits root discovery to authored inventory and the explicit generated assertion", () =>
  Effect.sync(() => {
    const config = {
      compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } },
      files: [".relkit/generated/route-module-checks.ts"],
      include: ["src/**/*.ts", "tests/**/*.ts", "relkit.config.ts"],
      exclude: ["node_modules", ".relkit"],
    };
    expect(Schema.is(SnapshotEligibleTsConfig)(config)).toBe(true);
    expect(
      Schema.is(SnapshotEligibleTsConfig)({ ...config, exclude: [...config.exclude, "web"] }),
    ).toBe(true);
    for (const include of [
      ["node_modules/**/*.ts"],
      [".relkit/**/*.ts"],
      ["../outside/**/*.ts"],
      [],
    ])
      expect(Schema.is(SnapshotEligibleTsConfig)({ ...config, include })).toBe(false);
    expect(Schema.is(SnapshotEligibleTsConfig)({ ...config, files: ["../outside.ts"] })).toBe(
      false,
    );
    expect(Schema.is(SnapshotEligibleTsConfig)({ ...config, exclude: [] })).toBe(false);
  }),
);

it.effect(
  "rejects compilation environment, time, randomness and unverified module evaluation",
  () =>
    Effect.gen(function* () {
      const sources = [
        "const secret = process.env.SYNTHETIC_SECRET; export default secret;",
        "const clock = Date.now(); export default clock;",
        "const random = Math.random(); export default random;",
        'import "./side-effect.js";',
        'import data from "../../outside.js"; export default data;',
        'import data from "../web/private.js"; export default data;',
        'import data from "./.env.json"; export default data;',
        'import data from "node:fs"; export default data;',
        'const data = await import("./source.js"); export default data;',
        'import { defineApp } from "@relkit/app/config"; export default defineApp({source:{include:["web/**"]}});',
        'import { z } from "@relkit/app/schema"; export default z.lazy(() => process.env.SYNTHETIC_SECRET);',
        'import { defineFunction } from "@relkit/app/functions"; const data = { get input() {return process.env.SYNTHETIC_SECRET} }; export default defineFunction(data);',
        'import { defineEnv } from "@relkit/app/config"; export default defineEnv({ [process.env.NAME]: "private" });',
        'import { z } from "@relkit/app/schema"; const data = { handler: () => process.env.SYNTHETIC_SECRET! }; export default z.string().default(data.handler);',
        'import { z } from "@relkit/app/schema"; const data = "literal"; export default z.string().default(data);',
        'import { z } from "@relkit/app/schema"; export default z.object({handler:z.string()}).default({handler: () => process.env.SYNTHETIC_SECRET});',
        'import { tool } from "langchain"; export default tool(() => "ok", { get name() { return process.env.NAME } });',
        'import { FakeToolCallingModel } from "langchain"; export default new FakeToolCallingModel(process.env.MODEL);',
      ];
      for (const source of sources)
        expect(
          Exit.isFailure(yield* Effect.exit(verifyStaticSnapshotSource(source, "src/app.ts"))),
          source,
        ).toBe(true);
    }),
);
