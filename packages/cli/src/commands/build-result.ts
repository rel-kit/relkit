import type { Diagnostic } from "@relkit/diagnostics";
import type { BuildResult } from "./build.js";

export function buildFailure(
  projectRoot: string,
  buildDirectory: string,
  diagnostics: readonly Diagnostic[],
): BuildResult {
  return Object.freeze({
    ok: false,
    projectRoot,
    buildDirectory,
    diagnostics: Object.freeze([...diagnostics]),
    artifacts: [],
  });
}
