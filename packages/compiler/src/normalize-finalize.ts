import type { CompilerGenerationFailure } from "./normalize-output.types.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";

import { createDiagnostic } from "@relkit/diagnostics";
import { hashGraphEffect } from "./normalize-graph.js";
import { generateManifestEffect } from "./generate-manifest.js";
import { generateJobsManifestEffect } from "./jobs/manifest.js";
import { makeOutputsEffect } from "./normalize-output.js";
import type { NormalizationWork } from "./normalize-types.js";
import { generateLocalServicePlanEffect } from "./local-service-plan.js";
import {
  RuntimeIntegrationPlanError,
  generateRuntimeIntegrationPlanEffect,
} from "./runtime-integration-plan.js";

/**
 * Generates activation and runtime artifacts from the validated graph.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that generates activation and runtime artifacts from the validated graph; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passOutputsEffect = Effect.fn("Compiler.passOutputs")(
  function* (work: NormalizationWork): Effect.fn.Return<void, CompilerGenerationFailure> {
    if (work.graph === undefined) return;
    const hash = yield* hashGraphEffect(work.graph);
    work.graphHash = hash;
    const runtimeIntegrations = yield* generateRuntimeIntegrationPlanEffect(
      work.graph,
      hash,
      work.input.runtimeIntegrationPackages,
    ).pipe(
      Effect.catchTag("RuntimeIntegrationPlanFailure", (failure) =>
        Effect.sync(() => {
          const error = failure.cause;
          if (!(error instanceof RuntimeIntegrationPlanError)) throw error;
          work.diagnostics.push(
            createDiagnostic({ code: error.code, severity: "error", message: error.message }),
          );
          return undefined;
        }),
      ),
    );
    const manifest = yield* generateManifestEffect({
      graph: work.graph,
      graphHash: hash,
      descriptors: work.descriptors,
      middleware: [...work.middlewareReferences.values()],
      transforms: [...work.transformReferences.values()],
      diagnostics: work.diagnostics,
      ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
    });
    work.diagnostics.push(...manifest.diagnostics);
    const jobsManifest = hasTaskJobs(work)
      ? yield* generateJobsManifestEffect({
          graph: work.graph,
          graphHash: hash,
          descriptors: work.descriptors,
          diagnostics: work.diagnostics,
          work,
          ...(work.input.projectRoot === undefined ? {} : { projectRoot: work.input.projectRoot }),
        })
      : undefined;
    if (jobsManifest !== undefined) work.diagnostics.push(...jobsManifest.diagnostics);
    const localServices = yield* generateLocalServicePlanEffect(work.graph, hash);
    work.outputs = yield* makeOutputsEffect(
      work.graph,
      hash,
      sortDiagnostics(work.diagnostics),
      work,
      manifest,
      jobsManifest,
      runtimeIntegrations,
      localServices,
    );
    if (work.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      work.outputs = Object.freeze({
        ...work.outputs,
        manifest: "",
        ...(hasTaskJobs(work) ? { jobsManifest: "" } : {}),
        runtimeActivation: "",
        runtimeIntegrations: "",
        runtimeIntegrationImports: "",
        localServices: "",
      });
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "passOutputs", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Generates activation and runtime artifacts from the validated graph.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passOutputs(work: NormalizationWork): void {
  return runCompilerSync(passOutputsEffect(work));
}

/**
 * Checks whether a compilation contains task-backed job artifacts.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns True when task descriptors or task-backed jobs require job artifacts.
 */
export function hasTaskJobs(work: NormalizationWork): boolean {
  return work.descriptors.some(
    (descriptor) =>
      descriptor.kind === "task" ||
      (descriptor.kind === "job" &&
        descriptor.value !== null &&
        typeof descriptor.value === "object" &&
        !Array.isArray(descriptor.value) &&
        "task" in descriptor.value),
  );
}

/**
 * Orders diagnostics by source position, code, severity, and message.
 * @typeParam T - Type of the values preserved by this operation.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns Diagnostics ordered by source, code, severity, and message.
 */
export function sortDiagnostics<
  T extends {
    code: string;
    severity: string;
    message: string;
    file?: string;
    line?: number;
    column?: number;
  },
>(diagnostics: readonly T[]): T[] {
  return [...diagnostics].sort(
    (left, right) =>
      (left.file ?? "").localeCompare(right.file ?? "") ||
      (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
      (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER) ||
      left.code.localeCompare(right.code) ||
      left.severity.localeCompare(right.severity) ||
      left.message.localeCompare(right.message),
  );
}
