import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { cachingGuideGroup } from "../scripts/caching-guide-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");

test("places Caching beside Storage and preserves useful TOC headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 10)).toEqual([
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
  ]);
  expect(await Bun.file(resolve(content, "caching/meta.json")).json()).toEqual({
    title: "Caching",
    icon: "Zap",
    pages: cachingGuideGroup.pages,
  });
  expect(guideRelations.some(({ path }) => path === "resources-ai/cache")).toBe(false);
  expect(await Bun.file(resolve(content, "resources-ai/cache.mdx")).exists()).toBe(false);

  for (const page of cachingGuideGroup.pages) {
    const source = await Bun.file(resolve(content, `caching/${page}.mdx`)).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("content/generated/related/");
  }
});

test("teaches caching in an existing app with a tested lookup and local Inspector steps", async () => {
  const tutorial = await Bun.file(resolve(content, "caching/first-cache.mdx")).text();
  expect(tutorial).toContain("existing RelKit app");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).toContain("relkit.config.ts#cache-profile");
  expect(tutorial).toContain("examples/commerce/tests/fixtures/get-price.function.ts");
  expect(tutorial).toContain("bun run dev --local=off");
  expect(tutorial).toContain("explicit replacements for both physical profiles");
  expect(tutorial).toContain("**Invoke locally**");
  expect(tutorial).toContain("## Inspect expiration");
});
