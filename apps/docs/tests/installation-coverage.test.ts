/** Requires a reviewed disposition and a usable setup path for every authored guide, independently of generated API pages. */
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Schema } from "effect";
import { guideGroups } from "../scripts/guide-catalog.js";

const root = resolve(import.meta.dir, "..");
const policy = Schema.Record(
  Schema.String,
  Schema.Tuple([
    Schema.Literals(["retain", "update"]),
    Schema.Literals(["installation", "continuation", "concept"]),
    Schema.String,
  ]),
);

test("every authored page is navigable and has a reviewed installation disposition", () => {
  const entries = Schema.decodeUnknownSync(Schema.fromJsonString(policy))(
    readFileSync(resolve(root, "scripts/installation-coverage.json"), "utf8"),
  );
  const catalog = [
    "docs/index",
    "docs/modules/index",
    "guides/index",
    ...guideGroups.flatMap(({ directory, pages }) =>
      pages
        .filter((page) => !guideGroups.some((group) => group.directory === `${directory}/${page}`))
        .map((page) => `${directory}/${page}`),
    ),
  ];
  const pages = readdirSync(resolve(root, "content"), { recursive: true, encoding: "utf8" })
    .filter(
      (path) =>
        path.endsWith(".mdx") &&
        !path.startsWith("docs/api/") &&
        !path.startsWith("blog/") &&
        !path.split("/").some((segment) => segment.startsWith("_")),
    )
    .map((path) => path.slice(0, -4))
    .sort();
  expect([...new Set(catalog)].sort()).toEqual(pages);
  expect(Object.keys(entries).sort()).toEqual(pages);
  for (const [page, [, kind, requirement]] of Object.entries(entries)) {
    const text = readFileSync(resolve(root, `content/${page}.mdx`), "utf8");
    if (kind === "concept") {
      expect(requirement, page).toBe("");
      continue;
    }
    const index = text.indexOf(requirement);
    expect(index, page).toBeGreaterThanOrEqual(0);
    const firstExample = text.search(/<include[^>]*lang="(?:ts|tsx)"|```(?:ts|tsx)\b/);
    if (firstExample >= 0) expect(index, page).toBeLessThan(firstExample);
    if (kind === "installation") {
      expect(requirement, page).toMatch(/^\/_snippets\/generated\/installations\/[^/]+\.mdx$/);
      expect(readFileSync(resolve(root, `content${requirement}`), "utf8"), page).toContain(
        "bun add",
      );
    } else {
      expect(requirement, page).toMatch(/^\/(docs|guides)\//);
      const path = requirement.split("#")[0]?.slice(1);
      expect(pages.includes(path ?? "") || pages.includes(`${path}/index`), page).toBe(true);
    }
  }
});
