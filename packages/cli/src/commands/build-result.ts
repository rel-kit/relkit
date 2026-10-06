import type { Diagnostic } from "@relkit/diagnostics";
import type { BuildResult } from "./build.js";

/**
 * Produces immutable failure evidence without exposing partial staged artifacts.
 * @param projectRoot - Authored root retained in the public result.
 * @param buildDirectory - Intended publication destination.
 * @param diagnostics - Complete accepted compiler/build diagnostics.
 * @returns The existing unsuccessful build envelope.
 */
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
