import { formatDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Formats already accepted diagnostics through the retained synchronous presentation edge.
 * @param projectRoot - Source evidence root.
 * @param diagnostics - Compiler-owned records.
 * @param color - Explicit existing terminal policy.
 * @returns Existing multiline compile failure text.
 */
export function formatDevDiagnostics(
  projectRoot: string,
  diagnostics: readonly Diagnostic[],
  color = false,
): string {
  if (!diagnostics.length) return "Project check failed.";
  return formatDiagnostics(diagnostics, {
    projectRoot,
    color,
    source: (file) => {
      try {
        return readFileSync(resolve(projectRoot, file), "utf8");
      } catch {
        return undefined;
      }
    },
  });
}
