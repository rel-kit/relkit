/**
 * Verifies `relkit mcp` end to end over stdio: it discovers the fixture's running session from
 * `.relkit/connections`, authenticates with the session token, and each tool returns structured
 * results. Without a session it exits with RELKIT_MCP_NO_SESSION before any MCP output.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@modelcontextprotocol/client";
import {
  cliEntry,
  connectRelkitMcp,
  repositoryRoot,
  startFixtureSession,
  type McpFixtureSession,
} from "./mcp-fixture.js";

let session: McpFixtureSession;
let client: Client;

beforeAll(async () => {
  session = await startFixtureSession();
  client = await connectRelkitMcp(session.project);
}, 60_000);

afterAll(async () => {
  await client?.close();
  await session?.stop();
});

/** Calls a tool and returns its structured content. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  return {
    isError: result.isError === true,
    value: result.structuredContent as Record<string, unknown> | undefined,
    text: (result.content as { text?: string }[])[0]?.text ?? "",
  };
}

test("lists every development tool", async () => {
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "graph",
    "diagnostics",
    "requests",
    "request_trace",
    "invoke_function",
    "check",
    "add",
  ]);
  const add = tools.find((tool) => tool.name === "add");
  expect(add?.inputSchema).toMatchObject({ required: ["kind"] });
  expect(tools.find((tool) => tool.name === "graph")?.annotations?.readOnlyHint).toBe(true);
});

test("graph returns the whole graph, one collection and one entry", async () => {
  const graph = await call("graph");
  expect(graph.isError).toBe(false);
  expect(JSON.stringify(graph.value)).toContain("orders.create");
  const functions = await call("graph", { collection: "functions" });
  expect(JSON.stringify(functions.value)).toContain("orders.create");
  const one = await call("graph", { collection: "functions", id: "orders.create" });
  expect(one.isError).toBe(false);
  expect(JSON.stringify(one.value)).toContain("orders.create");
  const missing = await call("graph", { collection: "functions", id: "missing.function" });
  expect(missing.isError).toBe(true);
  expect(missing.value).toMatchObject({ status: 404 });
});

test("diagnostics returns the generation's diagnostics", async () => {
  const diagnostics = await call("diagnostics");
  expect(diagnostics.isError).toBe(false);
  expect(diagnostics.value).toMatchObject({ status: "active", items: [] });
  expect(diagnostics.value).toHaveProperty("generationId");
});

test("requests and request_trace return a request's logs and trace", async () => {
  await fetch(`${session.backend}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku: "sku-1", quantity: 1 }),
  });
  let listed: Record<string, unknown>[] = [];
  for (let attempt = 0; attempt < 40 && listed.length === 0; attempt++) {
    listed = ((await call("requests")).value?.requests ?? []) as Record<string, unknown>[];
    if (listed.length === 0) await Bun.sleep(150);
  }
  const initial = listed.find((request) => request.requestId === "request-initial");
  expect(initial).toBeDefined();
  const trace = await call("request_trace", { id: "request-initial" });
  expect(trace.isError).toBe(false);
  expect(trace.value?.traceId).toBe(initial?.traceId);
  expect((trace.value?.logs as unknown[]).length).toBeGreaterThan(0);
  expect((trace.value?.spans as unknown[]).length).toBeGreaterThan(0);
  const unknown = await call("request_trace", { id: "request-that-never-ran" });
  expect(unknown.isError).toBe(true);
  expect(unknown.value?.code).toBe("RELKIT_INSPECTOR_NOT_FOUND");
});

test("invoke_function runs a function through the action API", async () => {
  const result = await call("invoke_function", {
    functionId: "orders.create",
    input: { sku: "sku-1", quantity: 1 },
  });
  expect(result.isError).toBe(false);
  expect(result.value).toMatchObject({ output: { ok: true, orderId: "order-100" } });
  const missing = await call("invoke_function", { functionId: "missing.function", input: {} });
  expect(missing.isError).toBe(true);
  expect(missing.value).toMatchObject({ status: 404 });
});

test("check returns a structured result for the session's project", async () => {
  const result = await call("check");
  expect(result.value).toHaveProperty("exitCode");
  expect(result.value).toHaveProperty("output");
  // The fixture project has no relkit.config.ts, so check fails with a coded result.
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.value)).toMatch(/RELKIT_[A-Z_]+/u);
});

test("add reports a failed transaction and leaves the project unchanged", async () => {
  const before = await readdir(session.project);
  const result = await call("add", { kind: "function", name: "orders.refund" });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.value)).toMatch(/RELKIT_[A-Z_]+/u);
  expect(await readdir(session.project)).toEqual(before);
  const rejected = await call("add", { kind: "function", options: { "project-root": "/" } });
  expect(rejected).toMatchObject({ isError: true, value: { code: "RELKIT_MCP_USAGE" } });
});

test("without a running session relkit mcp exits with RELKIT_MCP_NO_SESSION", async () => {
  const project = await mkdtemp(join(tmpdir(), "relkit-mcp-none-"));
  try {
    await writeFile(join(project, "package.json"), '{"name":"app","private":true}');
    const child = Bun.spawn([process.execPath, cliEntry, "mcp", "--project-root", project], {
      cwd: repositoryRoot,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("RELKIT_MCP_NO_SESSION");
    expect(stderr).toContain("relkit dev");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}, 30_000);
