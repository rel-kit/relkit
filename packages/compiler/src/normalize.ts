import { observeCompiler } from "./observability.js";
import { passOutputsEffect, sortDiagnostics } from "./normalize-finalize.js";
import { createDiagnostic } from "@relkit/diagnostics";
import { Cause, Effect, Schema } from "effect";
import { runCompilerSync } from "./compatibility.js";
import {
  passAgentsEffect,
  passCollisionsEffect,
  passEventTargetsEffect,
  passEventsEffect,
  passExtractWithSourcesEffect,
  passGraphEffect,
  passIndexEffect,
  passJobsEffect,
  passLocalEffect,
  passNormalizeEffect,
  passProvidersEffect,
  passReferencesEffect,
  passRoutesEffect,
  passSchemasEffect,
  passSourcesEffect,
  passToolsEffect,
} from "./normalize-passes.js";
import {
  EMPTY_OUTPUTS,
  VALIDATION_PASSES,
  type NormalizeInput,
  type NormalizationResult,
  type NormalizationWork,
} from "./normalize-types.js";
import { createWatchDependencyIndexEffect } from "./watch.js";
import { DiscoverySourceReader, nodeSourceReader } from "./discovery/source-map-source.js";

export * from "./normalize-types.js";

/** Recoverable pass exception translated into a compiler diagnostic. */
export class NormalizationPassError extends Schema.TaggedError<NormalizationPassError>()(
  "NormalizationPassError",
  { pass: Schema.String, cause: Schema.Defect() },
) {}

/**
 * Runs the compiler's ordered validation passes in a fresh execution-local workspace.
 * @param input - Descriptor values, source evidence, and optional pass observer.
 * @returns A lazy effect yielding the complete normalization result and diagnostics.
 * @remarks Requires DiscoverySourceReader. Pass exceptions become diagnostics and later passes continue. Observer defects
 * and fiber interruption propagate. Re-executing the effect allocates fresh mutable state.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { normalizeCompilationWithSourcesEffect } from "./normalize.js";
 * import { DiscoverySourceReader } from "./discovery/source-map-source.js";
 * const result = Effect.runSync(normalizeCompilationWithSourcesEffect({ descriptors: [] }).pipe(
 *   Effect.provideService(DiscoverySourceReader, DiscoverySourceReader.of({
 *     exists: () => Effect.succeed(false), read: () => Effect.succeed(""),
 *   })),
 * ));
 * ```
 */
export const normalizeCompilationWithSourcesEffect = Effect.fn("Compiler.normalizeCompilation")(
  function* (input: NormalizeInput = {}) {
    const work: NormalizationWork = {
      input,
      descriptors: [],
      references: new Map(),
      referencesByKind: new Map(),
      middlewareReferences: new Map(),
      transformReferences: new Map(),
      schemas: new Map(),
      schemaHashes: new Map(),
      nodes: [],
      edges: [],
      observedEdges: [...(input.observedEdges ?? [])],
      serviceDependencies: [],
      diagnostics: [],
      passOrder: [],
      outputs: EMPTY_OUTPUTS,
    };
    const passes: readonly Effect.Effect<void, unknown, DiscoverySourceReader>[] = [
      passExtractWithSourcesEffect(work),
      passSourcesEffect(work),
      passNormalizeEffect(work),
      passLocalEffect(work),
      passIndexEffect(work),
      passReferencesEffect(work),
      passSchemasEffect(work),
      passRoutesEffect(work),
      passJobsEffect(work),
      passEventsEffect(work),
      passEventTargetsEffect(work),
      passToolsEffect(work),
      passAgentsEffect(work),
      passProvidersEffect(work),
      passCollisionsEffect(work),
      passGraphEffect(work),
      passOutputsEffect(work),
    ];
    yield* Effect.forEach(
      passes.entries(),
      ([index, run]) =>
        Effect.gen(function* () {
          const pass = VALIDATION_PASSES[index];
          if (pass === undefined) return;
          work.passOrder.push(pass);
          input.onPass?.(pass, index + 1);
          yield* run.pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterrupts(cause)
                ? Effect.failCause(cause).pipe(Effect.orDie)
                : Effect.fail(new NormalizationPassError({ pass, cause: Cause.squash(cause) })),
            ),
            Effect.catchTag("NormalizationPassError", (error) =>
              Effect.sync(() => {
                work.diagnostics.push(
                  createDiagnostic({
                    code: "RELKIT_NORMALIZATION_FAILED",
                    severity: "error",
                    message: `${pass} failed: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
                  }),
                );
              }),
            ),
          );
        }),
      { discard: true },
    );
    return {
      passOrder: Object.freeze([...work.passOrder]),
      diagnostics: Object.freeze(sortDiagnostics(work.diagnostics)),
      descriptors: Object.freeze([...work.descriptors]),
      references: work.references,
      referencesByKind: work.referencesByKind,
      observedEdges: Object.freeze([...work.observedEdges]),
      ...(work.graph === undefined ? {} : { graph: work.graph }),
      ...(work.graphHash === undefined ? {} : { graphHash: work.graphHash }),
      outputs: work.outputs,
      watch: yield* createWatchDependencyIndexEffect(work.descriptors),
      activatable: work.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    };
  },
  (effect, input: NormalizeInput = {}) =>
    observeCompiler("normalization", "normalizeCompilation", effect, () => ({
      descriptors: input.extracted?.length ?? input.descriptors?.length ?? 0,
    })),
);

/**
 * Normalizes with the native source reader, preserving the no-service convenience API.
 * @param input - Compiler input and optional ordered pass observer.
 * @returns A lazy effect; the source-dependent owning operation is instrumented once.
 * @see {@link normalizeCompilationWithSourcesEffect} for caller-provided source access.
 */
export const normalizeCompilationEffect = (input: NormalizeInput = {}) =>
  normalizeCompilationWithSourcesEffect(input).pipe(
    Effect.provideService(DiscoverySourceReader, nodeSourceReader),
  );

/**
 * Runs normalization at the synchronous compiler compatibility boundary.
 * @param input - Descriptor values, source evidence, and optional pass observer.
 * @returns The normalized compilation with ordered diagnostics.
 * @throws The original observer defect when a pass observer throws.
 * @see {@link normalizeCompilationEffect} for composition and execution.
 */
export function normalizeCompilation(input: NormalizeInput = {}): NormalizationResult {
  return runCompilerSync(normalizeCompilationEffect(input));
}

/** Alias used by compiler callers that describe the input as descriptor values. */
export const normalizeDescriptors = normalizeCompilation;

/** Short alias for the compiler normalization entrypoint. */
export const normalize = normalizeCompilation;
