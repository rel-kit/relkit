import { join, resolve } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import {
  checkConventions,
  extractDescriptors,
  normalizeCompilation,
  prefilterSources,
  type GeneratedOutputs,
} from "@relkit/compiler";
import { sortDiagnostics } from "@relkit/diagnostics";
import { Effect } from "effect";
import { cliOriginalError, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCompiler } from "../services/compiler.service.js";
import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
import { writeEventRegistryEffect } from "./check-event-registry.js";
import { writeContextRegistryEffect } from "./check-context-registry.js";
import { writeRouteModuleChecksEffect } from "./check-route-modules.js";
import { emitCheckResultEffect } from "./check-result.js";
import {
  checkFailureDiagnosticsEffect,
  conventionDescriptor,
  evaluatorDiagnostics,
} from "./check-support.js";
import {
  discoverySourcesEffect,
  packageApplicationIdEffect,
  readConfigEffect,
  readSourcesEffect,
} from "./check-input.js";
import type { CheckOptions } from "./check.types.js";
export type { CheckOptions } from "./check.types.js";
export type { CheckResult } from "./check-result.types.js";

/**
 * Compiles a project using the caller's compiler, filesystem, and module capabilities.
 * @param options - Project inputs and evaluator policy; no runtime executes during construction.
 * @returns A lazy compilation outcome. Expected adapter failures become diagnostics; interruption and defects escape.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { checkProjectEffect } from "./check.js";
 * import { projectCapabilitiesLayer } from "../services/project-capabilities.js";
 * const checked = await Effect.runPromise(checkProjectEffect({}).pipe(Effect.provide(projectCapabilitiesLayer)));
 * ```
 */
export const checkProjectEffect = Effect.fn("Project.check")(
  function* (options: CheckOptions = {}) {
    const projectRoot = resolve(options.projectRoot ?? process.cwd());
    const generatedDirectory = join(projectRoot, ".relkit", "generated");
    const generationId = options.generationId ?? `cli-check-${crypto.randomUUID()}`;
    const work = Effect.gen(function* () {
      const compiler = yield* CliCompiler;
      const input = yield* readConfigEffect(projectRoot, options, generationId);
      const config = yield* compiler.loadConfig(input, projectRoot);
      const outputDirectory = join(projectRoot, config.generatedDirectory);
      const sources = yield* readSourcesEffect(projectRoot, config.source);
      yield* writeRouteModuleChecksEffect(
        sources.map((source) => source.fileName),
        projectRoot,
        config.generatedDirectory,
      );
      const discoverySources = yield* discoverySourcesEffect(projectRoot, options, sources);
      const prefiltered = yield* cliTry("project.prefilter", () =>
        prefilterSources(discoverySources, { projectRoot, exclude: config.exclude }),
      );
      const evaluator = yield* compiler.evaluate({
        projectRoot,
        candidates: prefiltered.candidates,
        generationId,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.environmentAllowlist === undefined
          ? {}
          : { environmentAllowlist: options.environmentAllowlist }),
        ...(options.networkAllowlist === undefined
          ? {}
          : { networkAllowlist: options.networkAllowlist }),
        generatedDirectory: config.generatedDirectory,
        sourceMaps: true,
      });
      if (evaluator.status !== "ok") {
        const typeDiagnostics = yield* compiler.typecheck(projectRoot, config.generatedDirectory);
        return yield* emitCheckResultEffect(projectRoot, outputDirectory, [
          ...typeDiagnostics,
          ...evaluatorDiagnostics(evaluator.failures),
        ]);
      }
      const extracted = yield* cliTry("project.extract", () =>
        extractDescriptors(evaluator, { projectRoot, sources: discoverySources }),
      );
      yield* Effect.all(
        [
          writeEventRegistryEffect(extracted, projectRoot, config.generatedDirectory),
          writeContextRegistryEffect(extracted, projectRoot, config.generatedDirectory),
        ],
        { concurrency: 2 },
      );
      const typeDiagnostics = yield* compiler.typecheck(projectRoot, config.generatedDirectory);
      const runtimeIntegrationPackages = yield* compiler.integrationPackages({
        projectRoot,
        imports: prefiltered.candidates.flatMap((candidate) => candidate.imports),
      });
      const appId = yield* packageApplicationIdEffect(projectRoot);
      const normalization = yield* cliTry("project.normalize", () =>
        normalizeCompilation({
          evaluator,
          projectRoot,
          sources: discoverySources,
          appId,
          mode: options.mode ?? "development",
          runtimeIntegrationPackages,
        }),
      );
      const diagnostics = sortDiagnostics([
        ...typeDiagnostics,
        ...normalization.diagnostics,
        ...extracted.flatMap((entry) =>
          checkConventions({
            descriptor: conventionDescriptor(entry.descriptor.kind, entry.descriptor.id),
            sourcePath: entry.reference.module,
            projectRoot,
            location: entry.source,
            exportKind: entry.exportKind,
          }),
        ),
      ]);
      const outputs = {
        ...normalization.outputs,
        diagnostics: `${canonicalJson(diagnostics)}\n`,
        manifest: normalization.activatable ? normalization.outputs.manifest : "",
      } satisfies GeneratedOutputs;
      return yield* emitCheckResultEffect(
        projectRoot,
        outputDirectory,
        diagnostics,
        outputs,
        normalization.graphHash,
        config,
      );
    });
    return yield* work.pipe(
      Effect.catchTag("CliAdapterError", (error) =>
        Effect.gen(function* () {
          const diagnostics = yield* checkFailureDiagnosticsEffect(
            cliOriginalError(error),
            projectRoot,
            resolve(projectRoot, options.configPath ?? "relkit.config.ts"),
          );
          return yield* emitCheckResultEffect(projectRoot, generatedDirectory, diagnostics);
        }),
      ),
    );
  },
  (effect, _options: CheckOptions = {}) => observeCli("project.check", effect),
);

/**
 * Compiles one project at its established public Promise boundary.
 * @param options - Project inputs, policies, and caller cancellation.
 * @returns Deterministic diagnostic and content-aware artifact results after scoped cleanup.
 * @see {@link checkProjectEffect} for lazy composition.
 */
export function checkProject(options: CheckOptions = {}) {
  return runCliEffect(checkProjectEffect(options), projectCapabilitiesLayer, options.signal);
}
/** Legacy alias for the same public compilation boundary. */
export const runCheck = checkProject;
