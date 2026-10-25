/** Verifies source-backed storage guides and grouped Assets placement. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { storageGuideGroup } from "../scripts/storage-guide-catalog.js";

const content = resolve(import.meta.dir, "../content");

test("places Storage beside Auth with focused pages and right-side TOC headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 9)).toEqual([
    "docs/learn",
    "docs/learn/concepts",
    "docs/modules/service",
    "docs/modules/http",
    "docs/modules/events",
    "docs/modules/jobs",
    "docs/modules/database",
    "docs/modules/auth",
    "docs/modules/storage",
  ]);
  expect((await import("../content/docs/modules/storage/meta.js")).default).toMatchObject({
    title: "Storage",
    pages: storageGuideGroup.pages,
  });
  expect(guideRelations.some(({ path }) => path === "resources-ai/buckets")).toBe(false);
  expect(await Bun.file(resolve(content, "resources-ai/buckets.mdx")).exists()).toBe(false);

  for (const page of storageGuideGroup.pages) {
    const source = await Bun.file(resolve(content, `docs/modules/storage/${page}.mdx`)).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(
      page === "index" ? 1 : 2,
    );
    expect(source).not.toContain("/_snippets/generated/related/");
  }
});

test("teaches an existing-app upload with source-backed examples and local verification", async () => {
  const tutorial = await Bun.file(
    resolve(content, "guides/storage/upload-product-images.mdx"),
  ).text();
  expect(tutorial).toContain("RELKIT application");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).toContain("relkit.config.ts#storage-local-profile");
  expect(tutorial).toContain("bun run dev --local=off");
  expect(tutorial).toContain("explicit replacements for profile `assets`");
  for (const source of [
    "services/assets/buckets/assets.bucket.ts",
    "services/assets/functions/upload-assets.function.ts",
    "services/assets/service.ts",
    "routes/uploads/route.ts",
  ]) {
    expect(tutorial).toContain(`examples/commerce/src/${source}`);
  }
  expect(tutorial).toContain("/uploads");
  expect(tutorial).toContain("## 5. Upload two images");
  expect(tutorial).toContain("## 6. Check the stored files");
});
