import { join } from "node:path";
import {
  EVENT_REGISTRY_FILE,
  generateEventRegistry,
  type ExtractedDescriptor,
} from "@relkit/compiler";
import { Effect } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler, compilerLayer } from "../services/compiler.service.js";

/**
 * Generates and publishes the declaration registry before dependent type checks.
 * @param descriptors - Accepted compiler source inputs.
 * @param projectRoot - Authored project root.
 * @param generatedDirectory - Project-relative declaration destination.
 * @returns A lazy content-aware write requiring only compiler authority.
 */
export const writeEventRegistryEffect = Effect.fn("Project.writeEventRegistry")(
  function* (
    descriptors: readonly ExtractedDescriptor[],
    projectRoot: string,
    generatedDirectory: string,
  ) {
    const compiler = yield* CliCompiler;
    const source = yield* cliTry("project.writeEventRegistry", () =>
      generateEventRegistry(descriptors, { projectRoot, generatedDirectory }),
    );
    yield* compiler.writeChanged(
      join(projectRoot, generatedDirectory, EVENT_REGISTRY_FILE),
      source,
    );
  },
  (
    effect,
    _descriptors: readonly ExtractedDescriptor[],
    _projectRoot: string,
    _generatedDirectory: string,
  ) => observeCli("project.writeEventRegistry", effect),
);

/**
 * Publishes the registry at the established Promise edge.
 * @param descriptors - Accepted compiler source inputs.
 * @param projectRoot - Authored project root.
 * @param generatedDirectory - Project-relative destination.
 * @returns A Promise resolving after content-aware publication.
 */
export function writeEventRegistry(
  descriptors: readonly ExtractedDescriptor[],
  projectRoot: string,
  generatedDirectory: string,
): Promise<void> {
  return runCliEffect(
    writeEventRegistryEffect(descriptors, projectRoot, generatedDirectory),
    compilerLayer,
  );
}
