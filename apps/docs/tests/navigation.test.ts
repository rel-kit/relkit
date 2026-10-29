/** Checks that the shared sidebar keeps all catalog pages reachable without duplicate overviews. */
import { expect, test } from "bun:test";
import { relative, resolve } from "node:path";
import type { SidebarItemConfig } from "blume/schema";
import { documentationSidebar } from "../scripts/generate-navigation.js";
import { markdownFiles } from "./documentation-fixture.js";

/** Collects page destinations from Blume's nested sidebar configuration.
 * @param items - Configured groups and page routes.
 * @returns Every linked page, including group overview links. */
function routes(items: readonly SidebarItemConfig[]): string[] {
  return items.flatMap((item) => {
    if (typeof item === "string") return [item];
    return [...(item.root ? [item.root] : []), ...routes(item.items ?? [])];
  });
}

test("sidebar links every documentation page exactly once", async () => {
  const content = resolve(import.meta.dir, "../content");
  const expected = (await markdownFiles(content))
    .map((file) =>
      relative(content, file)
        .replace(/\.mdx?$/, "")
        .replace(/\/index$/, ""),
    )
    .filter((path) => path === "docs" || path.startsWith("docs/") || path.startsWith("guides"))
    .map((path) => `/${path}`);
  const actual = routes(documentationSidebar);
  expect(new Set(actual).size).toBe(actual.length);
  expect(actual.sort()).toEqual(expected.sort());
});
