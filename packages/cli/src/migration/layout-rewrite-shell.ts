/** Conservatively rewrites known shell path operands while preserving comments and data output. */
import { applyTextEdits, mentionsMovedRoot, rewrittenToolPath } from "./layout-rewrite-paths.js";
import type { LayoutRewrite, LayoutTextEdit } from "./layout-rewrite.types.js";
import type { MigrationMove } from "./layout.types.js";
import { classifyLayoutShellToken, layoutShellTokens } from "./layout-shell-tokens.js";
import type { LayoutShellState } from "./layout-shell.types.js";

/**
 * Edits only command script operands, test/compiler inputs and explicit path flags.
 * @param file - Authored script or package manifest.
 * @param text - Complete shell command text.
 * @param moves - Selected service roots.
 * @returns Exact edits with unsupported affected tokens reported for manual action.
 */
export function rewriteLayoutShell(
  file: string,
  text: string,
  moves: readonly MigrationMove[],
): LayoutRewrite {
  const edits: LayoutTextEdit[] = [];
  const conflicts: LayoutRewrite["conflicts"][number][] = [];
  const state: LayoutShellState = { command: undefined, previous: "", scriptSeen: false };
  for (const token of layoutShellTokens(text)) {
    const raw = token[0];
    const classification = classifyLayoutShellToken(state, raw);
    if (classification.kind === "ignored") continue;
    const { value, quoted, supported } = classification;
    const affected = mentionsMovedRoot(value, moves);
    if (affected && supported && !/[$`{}\\]/.test(value)) {
      const next = value.includes("=")
        ? value.replace(/=(.*)$/, (_, path: string) => "=" + rewrittenToolPath(path, moves))
        : rewrittenToolPath(value, moves);
      if (next !== value)
        edits.push({
          start: token.index,
          end: token.index + raw.length,
          text: quoted ? raw[0] + next + raw.at(-1) : next,
        });
    } else if (affected)
      conflicts.push({
        file,
        message: `Unsupported affected shell operand at offset ${token.index}; update manually.`,
      });
  }
  return { text: applyTextEdits(text, edits), conflicts };
}
