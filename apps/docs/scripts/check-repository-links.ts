/**
 * Checks that relative links in the repository's root Markdown files point at files that exist.
 * The docs site's own links are checked by `blume validate`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Root Markdown files whose relative links must resolve. */
export const REPOSITORY_PAGES = ["README.md", "CONTRIBUTING.md", "WRITING.md"] as const;

/**
 * Lists relative links that do not resolve to a file or directory.
 * @param root - Repository root.
 * @param pages - Pages to read, relative to the root.
 * @returns `page: target` for each broken link, in page order.
 */
export function brokenRepositoryLinks(
  root: string,
  pages: readonly string[] = REPOSITORY_PAGES,
): string[] {
  const broken: string[] = [];
  for (const page of pages) {
    const source = readFileSync(join(root, page), "utf8").replace(/^```[\s\S]*?^```/gmu, "");
    for (const match of source.matchAll(/\]\(([^)\s]+)\)/gu)) {
      const target = match[1]!.split("#", 1)[0]!;
      if (target === "" || /^[a-z][a-z+.-]*:/iu.test(target)) continue;
      if (!existsSync(resolve(dirname(join(root, page)), target)))
        broken.push(`${page}: ${target}`);
    }
  }
  return broken;
}

if (import.meta.main) {
  const broken = brokenRepositoryLinks(resolve(import.meta.dir, "../../.."));
  if (broken.length > 0) {
    console.error(`Broken repository links:\n${broken.join("\n")}`);
    process.exit(1);
  }
  console.log(`Repository links resolve (${REPOSITORY_PAGES.join(", ")}).`);
}
