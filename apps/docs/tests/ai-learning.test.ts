import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { aiGuideGroup } from "../scripts/ai-guide-catalog.js";
import { guideGroups } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");

test("places AI beside Caching and keeps practical table-of-contents headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 10)).toEqual([
    "start",
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
  expect(tutorial).toContain("ask-assistant.function.ts");
  expect(tutorial).toContain("**Invoke locally**");

  const mcp = await Bun.file(resolve(content, "ai/mcp.mdx")).text();
  expect(mcp).toContain("Streamable HTTP");
  expect(mcp).toContain("exposed by default");
  expect(mcp).toContain("mcp: false");
  expect(mcp).toContain("explicit `timeoutMs`");
  expect(mcp).toContain("--method tools/call");
  expect(mcp).toContain("does not limit which tools MCP clients");
  expect(mcp).toMatch(/approval-required error without running\s+the function/);
});

test("explains AI SDK foundations, inherited schemas, callbacks, and streaming limits", async () => {
  const read = (page: string) => Bun.file(resolve(content, `ai/${page}.mdx`)).text();
  expect(await read("index")).toContain("built on Vercel's AI SDK");
  expect(await read("agents")).toContain("do not currently support streaming responses");
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
