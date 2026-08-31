import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { storageGuideGroup } from "../scripts/storage-guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");

test("places Storage beside Auth with focused pages and right-side TOC headings", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 8)).toEqual([
    "start",
    "service",
    "http",
    "events",
    "jobs",
    "database",
    "auth",
    "storage",
  ]);
  expect(await Bun.file(resolve(content, "storage/meta.json")).json()).toEqual({
    title: "Storage",
    icon: "HardDrive",
    pages: storageGuideGroup.pages,
  });
  expect(guideRelations.some(({ path }) => path === "resources-ai/buckets")).toBe(false);
  expect(await Bun.file(resolve(content, "resources-ai/buckets.mdx")).exists()).toBe(false);

  for (const page of storageGuideGroup.pages) {
    const source = await Bun.file(resolve(content, `storage/${page}.mdx`)).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("content/generated/related/");
  }
});

test("teaches an existing-app upload with source-backed examples and local verification", async () => {
  const tutorial = await Bun.file(resolve(content, "storage/first-upload.mdx")).text();
  expect(tutorial).toContain("existing RelKit app");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).toContain("RELKIT_ENV=test bun run dev");
  expect(tutorial).toContain("relkit.config.ts#storage-profile");
  expect(tutorial).toContain("platform/env.ts#storage-environment");
  for (const source of [
    "assets/buckets/assets.bucket.ts",
    "assets/functions/upload-assets.function.ts",
    "assets/service.ts",
    "routes/uploads/route.ts",
  ]) {
    expect(tutorial).toContain(`../../examples/commerce/src/${source}`);
  }
  expect(tutorial).toContain("/uploads");
  expect(tutorial).toContain("## Check the stored files");
});
