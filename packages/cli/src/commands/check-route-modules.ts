import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ROUTE_MODULE_CHECKS_FILE,
  ROUTE_MODULE_CHECK_REFERENCES,
  generateRouteModuleChecks,
} from "../compiler/index.js";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";

/**
 * Generates and publishes the declaration registry before dependent type checks. The registries
 * it references are written after normalization; until then an empty module stands in, so plain
 * `tsc` never reports a missing referenced file.
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
    for (const file of ROUTE_MODULE_CHECK_REFERENCES) {
      const path = join(projectRoot, generatedDirectory, file);
      if (!(yield* cliTry("project.routeModuleReference", () => existsSync(path))))
        yield* compiler.writeChanged(path, "export {};\n");
    }
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
