/** Pure guide-group builders and sequence lookup preserve source-backed documentation metadata. */
import type { ApiPackage } from "./documentation-catalog.js";
import { startJourney } from "../lib/start-journey.js";

/**
 * Describes one navigation group without opening or evaluating its source pages.
 * @param directory - Documentation directory.
 * @param title - User-facing section title.
 * @param icon - Supported navigation icon.
 * @param pages - Ordered authored pages.
 * @returns Unmodified group metadata.
 */
export function group(directory: string, title: string, icon: string, pages: readonly string[]) {
  return { directory, title, icon, pages };
}

/**
 * Describes public API and executable-source links for one guide.
 * @param path - Documentation slug.
 * @param api - Existing public package sections.
 * @param examples - Maintained source-relative examples.
 * @returns Source-backed guide relation.
 */
export function relation(path: string, api: readonly ApiPackage[], examples: readonly string[]) {
  return { path, api, examples };
}

/**
 * Looks up a guide's next step without asserting an arbitrary slug is a journey member.
 * @param path - Documentation slug.
 * @returns The next journey step, its completion guide, or no forced next step.
 */
export function nextGuide(path: string): string | undefined {
  const index = startJourney.findIndex((page) => page === path);
  if (index >= 0) return startJourney[index + 1] ?? "docs/learn/concepts/index";
  if (path === "docs/index" || path === "docs/learn/index") return "docs/learn/create-an-app";
  return undefined;
}
