/** Checks caching navigation and runnable shell examples against the maintained guide. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { cachingGuideGroup } from "../scripts/caching-guide-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";

const content = resolve(import.meta.dir, "../content");

test("places Caching beside Storage and preserves useful TOC headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 10)).toEqual([
    "docs/learn",
    "docs/learn/concepts",
    "docs/modules/service",
    "docs/modules/http",
    "docs/modules/events",
    "docs/modules/jobs",
    "docs/modules/database",
    "docs/modules/auth",
    "docs/modules/storage",
    "docs/modules/caching",
  ]);
  expect((await import("../content/docs/modules/caching/meta.js")).default).toMatchObject({
    title: "Caching",
    pages: cachingGuideGroup.pages,
  });
  expect(guideRelations.some(({ path }) => path === "resources-ai/cache")).toBe(false);
  expect(await Bun.file(resolve(content, "resources-ai/cache.mdx")).exists()).toBe(false);

  for (const page of cachingGuideGroup.pages) {
    const source = await Bun.file(resolve(content, `docs/modules/caching/${page}.mdx`)).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("/_snippets/generated/related/");
  }
});

test("teaches caching in an existing app with a tested lookup and local Inspector steps", async () => {
  const tutorial = await Bun.file(
    resolve(content, "guides/caching/cache-product-prices.mdx"),
  ).text();
  expect(tutorial).toContain("/docs/learn/first-route");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).toContain("relkit.config.ts#cache-local-profile");
  expect(tutorial).toContain("examples/commerce/tests/fixtures/get-price.function.ts");
  expect(tutorial).toContain("bun run dev --local=off");
  expect(tutorial).toContain("explicit replacement for the `requests` profile");
  expect(tutorial).toContain("http://localhost:3000/prices\\?sku=book-demo");
  expect(tutorial).toContain("Inspect expiration");
});
