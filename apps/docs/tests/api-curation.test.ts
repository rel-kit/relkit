/** Protects the curated order of generated API pages: most-used APIs and examples first, then everything. */
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { leadWithCommonApis } from "../scripts/api-curation.js";
import { authoringNames } from "../scripts/api-related.js";
import { apiPackageDefinitions } from "../scripts/documentation-catalog.js";

const read = (slug: string) =>
  readFile(resolve(import.meta.dir, `../content/docs/api/${slug}.mdx`), "utf8");

test("moves a named entry and its example ahead of the file sections without duplicating it", () => {
  const source = [
    "## `a.ts`",
    "",
    "### helper",
    "",
    "Internal.",
    "",
    "### popular",
    "",
    "```ts",
    "### not a heading",
    "```",
    "",
    "#### Details",
    "",
    "## `b.ts`",
    "",
    "### other",
    "",
    "## `c.ts`",
    "",
    "### popular (type alias)",
  ].join("\n");
  const { lead, rest } = leadWithCommonApis(source, ["popular", "missing"]);
  expect(lead).toBe(
    ["### popular", "", "```ts", "### not a heading", "```", "", "#### Details"].join("\n"),
  );
  expect(rest).toContain("### helper");
  expect(rest).toContain("### other");
  expect(rest).toContain("### popular (type alias)");
  expect(rest.match(/^### popular$/gm)).toBeNull();
});

test("drops a file heading when its only entry moved", () => {
  const { rest } = leadWithCommonApis("## `a.ts`\n\n### only\n\n## `b.ts`\n\n### kept", ["only"]);
  expect(rest).not.toContain("`a.ts`");
  expect(rest).toContain("## `b.ts`");
});

test("the jobs reference leads with its most-used APIs and examples, then keeps the complete reference", async () => {
  const page = await read("jobs");
  const lead = page.indexOf("## Most-used APIs");
  const complete = page.indexOf("## Complete reference");
  const first = page.indexOf("\n## `", complete);
  expect(lead).toBeGreaterThan(0);
  expect(complete).toBeGreaterThan(lead);
  expect(first).toBeGreaterThan(complete);
  for (const name of ["defineTask", "defineJob"]) {
    const heading = page.indexOf(`\n### ${name}\n`);
    expect(heading).toBeGreaterThan(lead);
    expect(heading).toBeLessThan(complete);
    expect(page.indexOf("**Example**", heading)).toBeLessThan(complete);
    expect(page.split(`\n### ${name}\n`)).toHaveLength(2);
  }
  expect(page).toContain("\n### defineTaskEffect\n");
  expect(page.indexOf("\n### defineTaskEffect\n")).toBeGreaterThan(complete);
  expect(page.indexOf("<include>/_snippets/generated/exports/jobs.mdx</include>")).toBeGreaterThan(
    complete,
  );
});

test("every package with cataloged common APIs leads with them", async () => {
  for (const { slug } of apiPackageDefinitions) {
    const names = authoringNames(slug);
    if (names.length === 0) continue;
    const page = await read(slug.replace("integrations/", "integrations/"));
    const lead = page.indexOf("## Most-used APIs");
    const complete = page.indexOf("## Complete reference");
    if (lead < 0) continue;
    expect(complete, slug).toBeGreaterThan(lead);
    expect(page.indexOf(`\n### ${names[0]}`), slug).toBeGreaterThan(lead);
  }
});
