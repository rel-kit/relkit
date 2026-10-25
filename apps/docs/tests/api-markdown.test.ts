/** Protects composed API pages from duplicate document headings and broken examples. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cleanDocgen } from "../scripts/generate-api.js";
import { referenceLinks, referenceOverview } from "../scripts/api-related.js";
import { apiPackageDefinitions } from "../scripts/documentation-catalog.js";

test("composes module headings without adding document titles or duplicate tables of contents", () => {
  const source = [
    "---",
    "title: bucket.ts",
    "---",
    "",
    "## bucket.ts overview",
    "",
    "---",
    "",
    "## Exports Grouped by Category",
    "",
    "- [utils](#utils)",
    "  - [defineBucket](#definebucket)",
    "",
    "---",
    "",
    "# utils",
    "",
    "## defineBucket",
    "",
    "Declares a bucket.",
    "",
    "```sh",
    "# Keep this comment",
    "```",
  ].join("\n");
  expect(cleanDocgen(source)).toBe(
    [
      "## `bucket.ts`",
      "",
      "### defineBucket",
      "",
      "Declares a bucket.",
      "",
      "```sh",
      "# Keep this comment",
      "```",
    ].join("\n"),
  );
});

test("keeps blank lines and heading-like text inside documentation code fences", () => {
  const code = "````md\n# An example\n\n\n```ts\nconst a = 1;\n```\n````";
  expect(cleanDocgen(`## example.ts overview\n\n${code}`)).toBe(`## \`example.ts\`\n\n${code}`);
});

test("connects bucket contracts to configuration and the complete upload workflow", () => {
  expect(referenceLinks("buckets")).toContain("/docs/modules/storage/");
  expect(referenceLinks("buckets")).toContain("/guides/storage/upload-product-images");
  expect(referenceLinks("not-a-package")).toBe("");
});

test("surfaces configuration symbols before readers enter the generated source sections", () => {
  expect(referenceLinks("app")).toContain("[defineApp](/docs/api/app#defineapp)");
  expect(referenceLinks("config")).toContain("[defineEnv](/docs/api/config#defineenv)");
  expect(referenceLinks("app")).not.toContain("/docs/api/app#docker");
  expect(referenceLinks("app")).not.toContain("[index]");
  expect(referenceLinks("integrations/docker")).toContain("/docs/api/integrations/docker#docker");
});

test("connects backend declarations to their frontend usage without inventing browser APIs", () => {
  for (const [slug, module] of [
    ["routes", "http/define#use-from-the-frontend"],
    ["services", "service/routes#use-from-the-frontend"],
    ["jobs", "jobs/clients#use-from-react"],
    ["agents", "ai/streaming#use-from-the-frontend"],
    ["realtime", "realtime/react"],
    ["better-auth", "auth/clients"],
  ] as const) {
    expect(referenceLinks(slug)).toContain(`](/docs/modules/${module})`);
  }
  expect(referenceLinks("client")).toContain("](/guides/frontend/connect-react)");
  expect(referenceLinks("buckets")).not.toContain("## Frontend usage");
});

test("the reference overview includes every cataloged package and configuration entrypoints", () => {
  const overview = referenceOverview();
  for (const { slug, packageName } of apiPackageDefinitions) {
    expect(overview).toContain(`](/docs/api/${slug})`);
    expect(overview).toContain(packageName);
  }
  expect(overview).toContain("[defineApp](/docs/api/app#defineapp)");
  expect(overview).toContain("[defineEnv](/docs/api/config#defineenv)");
});

test("common API links reach documented symbols in their defining package", async () => {
  for (const { slug } of apiPackageDefinitions) {
    const reference = await readFile(
      resolve(import.meta.dir, `../content/docs/api/${slug}.mdx`),
      "utf8",
    );
    for (const [, name] of referenceLinks(slug).matchAll(/\[([^\]]+)\]\(\/docs\/api\/[^)]+#/g)) {
      expect(reference, `${slug}: ${name}`).toContain(`### ${name}\n`);
    }
  }
});
