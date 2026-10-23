/** Verifies explicitly selected MCP against the official client and optional Inspector CLI. */
import { appFetch } from "./fixture-client.js";
import type { HttpInvocationOptions } from "../src/materialize-routes.types.js";
import { expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpApp as createApp } from "./optional-app-fixture.js";
import { runtimeCohort } from "./test-cohort.ts";

import { input, output, tool, toolPlan } from "./fixtures/mcp-setup.ts";
import { startBunFixture } from "./bun-fixture.ts";
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
