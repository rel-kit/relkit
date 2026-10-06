import { join } from "node:path";
import { ROUTE_MODULE_CHECKS_FILE, generateRouteModuleChecks } from "@relkit/compiler";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";

/**
 * Generates and publishes the declaration registry before dependent type checks.
 * @param files - Accepted compiler source inputs.
 * @param projectRoot - Authored project root.
 * @param generatedDirectory - Project-relative declaration destination.
 * @returns A lazy content-aware write requiring only compiler authority.
 */
export const writeRouteModuleChecksEffect = Effect.fn("Project.writeRouteModuleChecks")(
  function* (files: readonly string[], projectRoot: string, generatedDirectory: string) {
    const compiler = yield* CliCompiler;
    const source = yield* cliTry("project.writeRouteModuleChecks", () =>
      generateRouteModuleChecks(files, projectRoot, generatedDirectory),
    );
    yield* compiler.writeChanged(
      join(projectRoot, generatedDirectory, ROUTE_MODULE_CHECKS_FILE),
      source,
    );
  },
  (effect, _files: readonly string[], _projectRoot: string, _generatedDirectory: string) =>
    observeCli("project.writeRouteModuleChecks", effect),
);

/**
 * Publishes the registry at the established Promise edge.
 * @param files - Accepted compiler source inputs.
 * @param projectRoot - Authored project root.
 * @param generatedDirectory - Project-relative destination.
 * @returns A Promise resolving after content-aware publication.
 */
export function writeRouteModuleChecks(
  files: readonly string[],
  projectRoot: string,
  generatedDirectory: string,
): Promise<void> {
  return runCliEffect(
    writeRouteModuleChecksEffect(files, projectRoot, generatedDirectory),
    compilerLayer,
  );
}
