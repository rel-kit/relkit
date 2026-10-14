/** Dispatches format-aware tooling rewrites and keeps unsupported Markdown prose as a conflict. */
import { applyTextEdits, mentionsMovedRoot, rewrittenToolPath } from "./layout-rewrite-paths.js";
import type { MigrationMove } from "./layout.types.js";
import type { LayoutRewrite, LayoutTextEdit } from "./layout-rewrite.types.js";
import { rewriteLayoutShell } from "./layout-rewrite-shell.js";
import { rewriteLayoutJson } from "./layout-rewrite-json.js";

/**
 * Updates format-recognized literal paths while preserving all other bytes.
 * @param file - Project-relative tooling or documentation path.
 * @param text - Original authored text.
 * @param moves - Selected complete service roots.
 * @returns Rewritten text plus any reference requiring manual action.
 */
export function rewriteLayoutTooling(
  file: string,
  text: string,
  moves: readonly MigrationMove[],
): LayoutRewrite {
  if (/\.jsonc?$/.test(file)) return rewriteLayoutJson(file, text, moves);
  if (/\.(?:sh|bash|zsh)$/.test(file)) return rewriteLayoutShell(file, text, moves);
  const edits: LayoutTextEdit[] = [];
  for (const match of text.matchAll(/\x60[^\x60\n]+\x60|\]\([^\n)]+\)/g)) {
    const value = match[0].replace(/(?:\.\/)?src\/[^\s"'\x60;)]+/g, (token) =>
      /[$\x60{]/.test(token) ? token : rewrittenToolPath(token, moves),
    );
    if (value !== match[0])
      edits.push({ start: match.index, end: match.index + match[0].length, text: value });
  }
  const result = applyTextEdits(text, edits);
  const conflicts = mentionsMovedRoot(result, moves)
    ? [
        {
          file,
          message:
            "Affected reference is not a supported literal tooling path; review and update it manually before write.",
        },
      ]
    : [];
  return { text: result, conflicts };
}
