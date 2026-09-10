import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { aiGuideGroup } from "../scripts/ai-guide-catalog.js";
import { guideGroups } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");

test("places AI beside Caching and keeps practical table-of-contents headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 11)).toEqual([
    "start",
    "fundamentals",
    "service",
    "http",
    "events",
    "jobs",
    "database",
    "auth",
    "storage",
    "caching",
    "ai",
  ]);
  expect(await Bun.file(resolve(content, "ai/meta.json")).json()).toEqual({
    title: "AI",
    icon: "Bot",
    pages: aiGuideGroup.pages,
  });

  for (const page of aiGuideGroup.pages) {
    const source = await Bun.file(resolve(content, `ai/${page}.mdx`)).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("content/generated/related/");
  }

  for (const page of ["agents", "tools", "approvals"]) {
    expect(await Bun.file(resolve(content, `resources-ai/${page}.mdx`)).exists()).toBe(false);
  }
});

test("documents an existing-app tutorial and MCP's exposure and approval boundaries", async () => {
  const tutorial = await Bun.file(resolve(content, "ai/first-agent.mdx")).text();
  expect(tutorial).toContain("existing RelKit app");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).toContain("tests/unit/assistant.agent.test.ts");
  expect(tutorial).toContain("web/app/agent-config.ts");
  expect(tutorial).toContain("caller-owned thread IDs");

  const mcp = await Bun.file(resolve(content, "ai/mcp.mdx")).text();
  expect(mcp).toContain("Streamable HTTP");
  expect(mcp).toContain("exposed by default");
  expect(mcp).toContain("mcp: false");
  expect(mcp).toContain("explicit `timeoutMs`");
  expect(mcp).toContain("--method tools/call");
  expect(mcp).toContain("does not limit which tools MCP clients");
  expect(mcp).toMatch(/approval-required error without running\s+the function/);
});

test("explains native agent foundations, inherited schemas, callbacks, and streaming", async () => {
  const read = (page: string) => Bun.file(resolve(content, `ai/${page}.mdx`)).text();
  expect(await read("index")).toContain("native LangChain and LangGraph APIs");
  expect(await read("index")).toContain("DeepAgents");
  expect(await read("agents")).toContain("durable thread journal");
  expect(await read("agents")).toContain("caller's stable business thread ID");
  expect(await read("tools")).toContain("hello/functions/hello.function.ts");
  expect(await read("tools")).toContain("inherits both from `target`");
  const approvals = await read("approvals");
  expect(approvals).toContain("cancel-order-with-approval.ts#approval-callback");
  expect(approvals).toContain("tool-approvals.test.ts#sync-approvals");
  expect(approvals).toContain("The tool's `approval` policy is not a function");
  const mcp = await read("mcp");
  expect(mcp).toContain("mcp-options.ts#private-tool");
  expect(mcp).toContain("mcp-options.ts#disable-mcp");
});

test("documents native compatibility, typed state, graphs, persistence, and resume", async () => {
  const native = await Bun.file(resolve(content, "ai/native-runtime.mdx")).text();
  expect(native).toMatch(/`langchain`\s+\| `1\.5\.10`/);
  expect(native).toContain("RELKIT_DEEPAGENTS_UNAVAILABLE");
  expect(native).toContain("explicit dynamic");
  expect(native).toContain("order-support.agent.ts");
  expect(native).toContain("order-deep.agent.ts");

  const graph = await Bun.file(resolve(content, "ai/graphs-persistence.mdx")).text();
  expect(graph).toContain("order-review.agent.ts");
  expect(graph).toContain("defineCheckpointerDb");
  expect(graph).toContain("never calls driver `.setup()`");
  expect(graph).toContain("borrowed by default");
  expect(graph).toContain("caller-owned `threadId`");
  expect(graph).toContain("{ resume: true }");
});
