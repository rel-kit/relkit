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
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
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

test("an approval-required tool returns an actionable coded error and does not run", async () => {
  const calls: HttpInvocationOptions[] = [];
  const plan = toolPlan([tool("approved", true, "always")]);
  const app = createApp({
    plan,
    manifest: {
      ...runtimeCohort(plan.graphHash),
      functions: {},
      middleware: {},
      requestTransforms: {},
      tools: { approved: { target: { input, output } } },
    },
    engine: {
      invoke: async (options) => {
        calls.push(options);
        return { echoed: "ran" };
      },
    },
  });
  const client = new Client({ name: "no-approval-ui", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), { fetch: appFetch(app) }),
  );
  const result = await client.callTool({ name: "approved", arguments: { value: "no" } });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    code: "RELKIT_MCP_APPROVAL_REQUIRED",
    tool: "approved",
    docs: "https://relkit.dev/docs/errors/relkit-mcp-approval-required",
  });
  const [content] = result.content as { type: string; text: string }[];
  expect(content?.text).toMatch(/^RELKIT_MCP_APPROVAL_REQUIRED: /u);
  expect(content?.text).toContain('approval to "never"');
  expect(calls).toHaveLength(0);
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

inspectorTest(
  "lists and calls relkit mcp tools through the MCP Inspector CLI",
  async () => {
    const root = resolve(import.meta.dirname, "../../..");
    await mkdir(join(root, ".relkit"), { recursive: true });
    const runs = await mkdtemp(join(root, ".relkit/inspector-browser-mcp-cli-"));
    const project = join(runs, "project");
    const fixture = spawn("bun", ["tests/inspector/fixture-server.ts"], {
      cwd: root,
      env: {
        ...process.env,
        RELKIT_FIXTURE_PORT: String(20_000 + Math.floor(Math.random() * 20_000)),
        RELKIT_FIXTURE_PROJECT: project,
      },
      stdio: "ignore",
    });
    try {
      for (let attempt = 0; attempt < 300; attempt++) {
        const files = await readdir(join(project, ".relkit/connections")).catch(() => []);
        if (files.some((name) => name.endsWith(".json"))) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      const inspector = (...args: string[]) =>
        promisify(execFile)(
          "bun",
          [
            "x",
            "@modelcontextprotocol/inspector@2.3.0",
            "--cli",
            "bun",
            join(root, "packages/cli/src/bin.ts"),
            "mcp",
            // The Inspector CLI keeps server flags it does not know for itself, so the project
            // is selected by working directory, as a coding agent starts relkit mcp.
            "--cwd",
            project,
            ...args,
          ],
          { cwd: root, timeout: 40_000 },
        );
      const listed = await inspector("--method", "tools/list");
      for (const name of [
        "graph",
        "diagnostics",
        "request_trace",
        "invoke_function",
        "check",
        "add",
      ])
        expect(listed.stdout).toContain(`"name": "${name}"`);
      const called = await inspector(
        "--method",
        "tools/call",
        "--tool-name",
        "graph",
        "--tool-arg",
        "collection=functions",
      );
      expect(called.stdout).toContain("orders.create");
    } finally {
      fixture.kill();
      await rm(runs, { recursive: true, force: true });
    }
  },
  120_000,
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

test("an MCP tool call runs the target's access rule against the caller's session", async () => {
  const { createHttpAuthRuntime } =
    await import("../../../packages/relkit/src/runtime-hono/auth.ts");
  const { invokeFunction, sessionPrincipalSource } =
    await import("../../../packages/relkit/src/engine/index.ts");
  const { defineFunction } = await import("../../../packages/relkit/src/app/index.ts");
  const adminEcho = defineFunction({
    id: "echo",
    input,
    output,
    access: { roles: ["admin"] },
    handler: async ({ value }) => ({ echoed: value }),
  });
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
        // What the generated server does: the caller is the request's session.
        invoke: async (options) =>
          invokeFunction(adminEcho as never, options.input, {
            source: options.source ?? "tool",
            principal: sessionPrincipalSource(
              async () => (await options.auth?.getSession()) ?? null,
            ),
          }),
      },
    });
  const call = async (session: unknown) => {
    const client = new Client({ name: "test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
        fetch: appFetch(build(session)),
      }),
    );
    try {
      return await client.callTool({ name: "echo", arguments: { value: "hi" } });
    } finally {
      await client.close();
    }
  };
  expect(await call({ user: { role: "admin" } })).toEqual(
    expect.objectContaining({ structuredContent: { echoed: "hi" } }),
  );
  expect(await call({ user: { role: "member" } })).toEqual(
    expect.objectContaining({
      isError: true,
      content: [expect.objectContaining({ text: "access-denied" })],
    }),
  );
});
