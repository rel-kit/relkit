/** Verifies explicitly selected MCP against the official client and optional Inspector CLI. */
import { appFetch } from "./fixture-client.js";
import type { HttpInvocationOptions } from "../../../packages/relkit/src/runtime-hono/materialize-routes.types.js";
import { expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpApp as createApp } from "../../../packages/relkit/tests/runtime-hono/optional-app-fixture.js";
import { runtimeCohort } from "../../../packages/relkit/tests/runtime-hono/test-cohort.ts";

import {
  input,
  output,
  tool,
  toolPlan,
} from "../../../packages/relkit/tests/runtime-hono/fixtures/mcp-setup.ts";
import { startBunFixture } from "../../../packages/relkit/tests/runtime-hono/bun-fixture.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("lists and invokes visible tools through the official client", async () => {
  const calls: HttpInvocationOptions[] = [];
  const plan = toolPlan([
    tool("echo", true, "never"),
    tool("hidden", false, "never"),
    tool("approved", true, "always"),
  ]);
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      tools: Object.fromEntries(
        plan.tools.map((entry) => [entry.id, { target: { input, output } }]),
      ),
    },
    engine: {
      invoke: async (options) => {
        calls.push(options);
        return { echoed: input.parse(options.input).value };
      },
    },
  });
  const client = new Client({ name: "test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: appFetch(app),
  });
  await client.connect(transport);
  expect((await client.listTools()).tools.map((entry) => entry.name)).toEqual(["approved", "echo"]);
  expect(await client.callTool({ name: "echo", arguments: { value: "hello" } })).toEqual(
    expect.objectContaining({ structuredContent: { echoed: "hello" } }),
  );
  expect(await client.callTool({ name: "approved", arguments: { value: "no" } })).toEqual(
    expect.objectContaining({ isError: true }),
  );
  expect(calls).toHaveLength(1);
  await client.close();
});

const inspectorTest = process.env.RELKIT_MCP_INSPECTOR_CLI === "1" ? test : test.skip;
inspectorTest(
  "lists tools through the MCP Inspector CLI",
  async () => {
    const server = await startBunFixture("mcp");
    try {
      const { stdout } = await promisify(execFile)(
        "bun",
        [
          "x",
          "@modelcontextprotocol/inspector@2.3.0",
          "--cli",
          `http://127.0.0.1:${server.port}/mcp`,
          "--transport",
          "http",
          "--method",
          "tools/list",
        ],
        { timeout: 25_000 },
      );
      expect(stdout).toContain('"name": "echo"');
    } finally {
      await server.stop();
    }
  },
  30_000,
);

test("MCP with auth required rejects callers without a session before any tool runs", async () => {
  const { createHttpAuthRuntime } =
    await import("../../../packages/relkit/src/runtime-hono/auth.ts");
  const calls: HttpInvocationOptions[] = [];
  const plan = toolPlan([tool("echo", true, "never")]);
  const build = (session: unknown) =>
    createApp({
      plan,
      manifest: {
        ...runtimeCohort(plan.graphHash),
        functions: {},
        middleware: {},
        requestTransforms: {},
        tools: Object.fromEntries(
          plan.tools.map((entry) => [entry.id, { target: { input, output } }]),
        ),
      },
      mcp: { enabled: true, auth: "required" },
      auth: createHttpAuthRuntime({ getSession: async () => session }),
      engine: {
        invoke: async (options) => {
          calls.push(options);
          return { echoed: input.parse(options.input).value };
        },
      },
    });
  const rejected = await appFetch(build(null))("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(rejected.status).toBe(401);
  expect(await rejected.json()).toMatchObject({ code: "unauthenticated" });

  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: appFetch(build("user-1")),
    }),
  );
  expect(await client.callTool({ name: "echo", arguments: { value: "hi" } })).toEqual(
    expect.objectContaining({ structuredContent: { echoed: "hi" } }),
  );
  expect(calls).toHaveLength(1);
  await client.close();
});
