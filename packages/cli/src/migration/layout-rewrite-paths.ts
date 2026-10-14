/** Rewrites recognized path literals without replacing unrelated text or logical IDs. */
import { dirname, posix } from "node:path";
import { movedPath } from "./layout-paths.js";
import type { MigrationMove } from "./layout.types.js";
import type { LayoutTextEdit } from "./layout-rewrite.types.js";

/**
 * Resolves a local module to a candidate-relative specifier, retaining authored extension style.
 * @param importer - Original importer path.
 * @param target - Resolved original source target.
 * @param specifier - Original literal specifier.
 * @param moves - Complete selected root moves.
 * @returns Rewritten specifier, or original when neither endpoint moved.
 */
export function rewrittenModule(
  importer: string,
  target: string,
  specifier: string,
  moves: readonly MigrationMove[],
): string {
  const from = movedPath(importer, moves),
    to = movedPath(target, moves);
  if (from === importer && to === target) return specifier;
  let path = posix.relative(dirname(from), to);
  if (!path.startsWith(".")) path = `./${path}`;
  if (/\.jsx?$/.test(specifier))
    return path.replace(/\.[cm]?tsx?$/, specifier.endsWith(".jsx") ? ".jsx" : ".js");
  if (!/\.[cm]?[jt]sx?$/.test(specifier)) return path.replace(/\.[cm]?[jt]sx?$/, "");
  return path;
}

/**
 * Changes a known project-rooted tooling path, including its glob suffix.
 * @param literal - Format-validated path literal.
 * @param moves - Selected service moves.
 * @returns Candidate literal or unchanged value.
 */
export function rewrittenToolPath(literal: string, moves: readonly MigrationMove[]): string {
  const prefix = literal.startsWith("./") ? "./" : "";
  return prefix + movedPath(literal.slice(prefix.length), moves);
}

/** Rebases a literal module-relative asset URL, retaining its URL encoding and suffixes.
 * @param importer - Original project-relative containing module.
 * @param specifier - Literal URL resolved against import.meta.url.
 * @param moves - Complete selected service moves.
 * @returns The same asset's URL relative to the migrated containing module. */
export function rewrittenSourceUrl(
  importer: string,
  specifier: string,
  moves: readonly MigrationMove[],
): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|[?#]|$)/i.test(specifier)) return specifier;
  const base = "/__relkit_layout__/";
  const target = new URL(specifier, `file://${base}${importer}`);
  const file = posix.relative(base, decodeURIComponent(target.pathname));
  const from = movedPath(importer, moves),
    to = movedPath(file, moves);
  if (from === importer && to === file) return specifier;
  let path = posix.relative(posix.dirname(from), to);
  if (!path.startsWith(".")) path = `./${path}`;
  if (target.pathname.endsWith("/") && !path.endsWith("/")) path += "/";
  return path.split("/").map(encodeURIComponent).join("/") + target.search + target.hash;
}

/**
 * Detects an old physical root requiring either a supported edit or manual review.
 * @param text - Source or prose fragment.
 * @param moves - Selected service roots.
 * @returns Whether a moved physical root occurs in the fragment.
 */
export function mentionsMovedRoot(text: string, moves: readonly MigrationMove[]): boolean {
  return moves.some(({ from }) =>
    [from, `@app/${from.slice(4)}`].some((root) => {
      const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("(?:^|[\\s\"'\`(=])(?:\\./)?" + escaped + "(?=$|[/\\s\"'\`)#])").test(text);
    }),
  );
}

/**
 * Applies non-overlapping syntax offsets from right to left without reprinting comments.
 * @param text - Original authored text.
 * @param edits - Exact syntax token replacements.
 * @returns Candidate text with unrelated bytes preserved.
 */
export function applyTextEdits(text: string, edits: readonly LayoutTextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}
