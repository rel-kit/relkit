import { describe, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { GENERATOR_VERSION, MANIFEST_VERSION } from "@zsys/contracts";
import type { RegistrationPlan, ToolRegistration } from "@zsys/graph";
import { z } from "@zsys/schema";
import { createApp } from "./src/index.js";

const source = { file: "src/tools.ts", line: 1, column: 1 };
const input = z.object({ value: z.string() });
const output = z.object({ echoed: z.string() });

describe("MCP", () => {
  test("lists and invokes visible tools through the official client", async () => {
    const calls: unknown[] = [];
    const plan = toolPlan([
      tool("echo", true, "never"),
      tool("hidden", false, "never"),
      tool("approved", true, "always"),
    ]);
    const app = createApp({
      plan,
      manifest: {
        contractVersion: MANIFEST_VERSION,
        generatorVersion: GENERATOR_VERSION,
        graphHash: plan.graphHash,
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
          return { echoed: (options.input as { value: string }).value };
        },
      },
    });
    const client = new Client({ name: "test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: (request, init) => app.fetch(new Request(request, init)),
    });
    await client.connect(transport);
    expect((await client.listTools()).tools.map((entry) => entry.name)).toEqual([
      "approved",
      "echo",
    ]);
    expect(await client.callTool({ name: "echo", arguments: { value: "hello" } })).toEqual(
      expect.objectContaining({ structuredContent: { echoed: "hello" } }),
    );
    expect(await client.callTool({ name: "approved", arguments: { value: "no" } })).toEqual(
      expect.objectContaining({ isError: true }),
    );
    expect(calls).toHaveLength(1);
    await client.close();
  });

  const inspectorTest = process.env.ZSYS_MCP_INSPECTOR_CLI === "1" ? test : test.skip;
  inspectorTest(
    "lists tools through the MCP Inspector CLI",
    async () => {
      const plan = toolPlan([tool("echo", true, "never")]);
      const app = createApp({
        plan,
        manifest: {
          contractVersion: MANIFEST_VERSION,
          generatorVersion: GENERATOR_VERSION,
          graphHash: plan.graphHash,
          functions: {},
          middleware: {},
          requestTransforms: {},
          tools: { echo: { target: { input, output } } },
        },
        engine: { invoke: async () => ({ echoed: "hello" }) },
      });
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
      try {
        const child = Bun.spawn(
          [
            process.execPath,
            "x",
            "@modelcontextprotocol/inspector@2.3.0",
            "--cli",
            `http://127.0.0.1:${server.port}/mcp`,
            "--transport",
            "http",
            "--method",
            "tools/list",
          ],
          { stdout: "pipe", stderr: "pipe" },
        );
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(exitCode, stderr).toBe(0);
        expect(stdout).toContain('"name": "echo"');
      } finally {
        await server.stop();
      }
    },
    30_000,
  );
});

function tool(id: string, mcp: boolean, approval: ToolRegistration["approval"]): ToolRegistration {
  return {
    kind: "tool",
    id,
    source,
    targetFunctionId: `${id}.function`,
    description: `${id} tool`,
    sideEffect: "read",
    approval,
    mcp,
  };
}

function toolPlan(tools: readonly ToolRegistration[]): RegistrationPlan {
  return {
    graphHash: "sha256:mcp",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools,
    agents: [],
    middlewares: [],
  };
}
