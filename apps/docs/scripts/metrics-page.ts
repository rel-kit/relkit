/** Renders the metrics page's table from the metrics report CI produced, or the checked-in fallback. */
import { resolve } from "node:path";
import { metricsSnippet } from "../../../scripts/metrics/render.js";

/**
 * Renders the table.
 * @param docsRoot - `apps/docs`.
 * @returns MDX for `_snippets/generated/metrics.mdx`.
 */
export function metricsPage(docsRoot: string): string {
  return metricsSnippet(resolve(docsRoot, "data/metrics.json"));
}
