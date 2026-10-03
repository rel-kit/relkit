import { isDescriptorEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import { runDiscoverySync } from "./discovery-sync.js";
import {
  EvaluatorExportSnapshot,
  EvaluatorFailure as FailureSchema,
  EvaluatorModuleResult as ModuleSchema,
  EvaluatorManifestReference as ReferenceSchema,
} from "./evaluator-protocol-schema.js";
import type {
  EvaluatorCandidate,
  EvaluatorFailure,
  EvaluatorManifestReference,
  EvaluatorModuleResult,
  EvaluatorRequest,
  EvaluatorSideEffect,
} from "./evaluator-protocol.types.js";
import { snapshotDescriptorEffect } from "./evaluator-snapshot.js";
import type { SnapshotDescriptorLike } from "./evaluator-snapshot.types.js";
import { isSnapshotErrorDescriptorEffect } from "./evaluator-snapshot-capabilities.js";

/**
 * Snapshots descriptor exports in deterministic name order without executable metadata.
 * @param module - Native module namespace returned by the import boundary.
 * @param candidate - Candidate source identity.
 * @param request - Accepted generation and project configuration.
 * @returns A lazy effect yielding module snapshots and executable lookup references.
 * @remarks Trusted descriptor access failures remain defects; no domain recovery occurs here.
 */
export const snapshotModuleEffect = Effect.fn("Discovery.snapshotEvaluatorModule")(
  function* (
    module: Record<string, unknown>,
    candidate: EvaluatorCandidate,
    request: EvaluatorRequest,
  ) {
    const exports: EvaluatorModuleResult["exports"][number][] = [];
    const manifestReferences: EvaluatorManifestReference[] = [];
    yield* Effect.forEach(
      Object.keys(module).sort(),
      (exportName) =>
        Effect.gen(function* () {
          const value = yield* selectCompilerDescriptor(module[exportName]);
          if (value === undefined) return;
          const descriptor = yield* snapshotDescriptorEffect(value);
          exports.push(EvaluatorExportSnapshot.make({ exportName, descriptor }));
          manifestReferences.push(
            ReferenceSchema.make({
              generationId: request.generationId,
              descriptorId: descriptor.id,
              kind: descriptor.kind,
              module: candidate.file,
              exportName,
            }),
          );
        }),
      { discard: true },
    );
    return ModuleSchema.make({
      file: candidate.file,
      exports: Object.freeze(exports),
      manifestReferences: Object.freeze(manifestReferences),
    });
  },
  (effect, module) =>
    observeCompiler(
      "discovery",
      "snapshotModule",
      effect,
      () => ({ files: 1, entries: Object.keys(module).length }),
      false,
    ),
);

/**
 * Synchronous compatibility boundary for module snapshot consumers.
 * @param module - Imported module namespace.
 * @param candidate - Candidate source identity.
 * @param request - Accepted evaluator configuration.
 * @returns The module snapshot and ordered executable references.
 */
export function snapshotModule(
  module: Record<string, unknown>,
  candidate: EvaluatorCandidate,
  request: EvaluatorRequest,
): EvaluatorModuleResult {
  return runDiscoverySync(snapshotModuleEffect(module, candidate, request));
}

/**
 * Selects imported descriptors through the authoritative Effect contract and compiler traits.
 * @param value - Imported export whose descriptor identity may be inspected.
 * @returns A lazy effect yielding the descriptor, or undefined for ordinary exports.
 * @remarks Unexpected identity access failures remain defects. The checked assertions below
 * restore TypeScript narrowing after the authoritative boolean validation effect.
 */
const selectCompilerDescriptor = Effect.fn("Discovery.selectCompilerDescriptor")(function* (
  value: unknown,
) {
  if (yield* isDescriptorEffect(value)) {
    // isDescriptorEffect validated the external descriptor identity and matching reference.
    return value as SnapshotDescriptorLike;
  }
  if (typeof value === "function" && (yield* isSnapshotErrorDescriptorEffect(value))) {
    return value as unknown as SnapshotDescriptorLike;
  }
  if (
    !isRecord(value) ||
    (value.kind !== "middleware" && value.kind !== "transform" && value.kind !== "error")
  )
    return undefined;
  if (
    typeof value.id === "string" &&
    isRecord(value.ref) &&
    value.ref.kind === value.kind &&
    value.ref.id === value.id
  ) {
    // Compiler-only traits have just passed the same identity/reference shape checks.
    return value as unknown as SnapshotDescriptorLike;
  }
  return undefined;
});

/**
 * Frames observed native effects as an expected candidate failure.
 * @param sideEffects - Ordered detector observations for this candidate.
 * @param module - Candidate's source path.
 * @param request - Accepted generation identity.
 * @returns A lazy effect yielding a wire-compatible side-effect diagnostic.
 */
export const sideEffectFailureEffect = Effect.fn("Discovery.frameSideEffectFailure")(
  function* (
    sideEffects: readonly EvaluatorSideEffect[],
    module: string,
    request: EvaluatorRequest,
  ) {
    return FailureSchema.make({
      code: "RELKIT_EVALUATOR_SIDE_EFFECT",
      message: `Candidate evaluation detected ${sideEffects.length} side effect(s).`,
      generationId: request.generationId,
      module,
      sideEffects,
    });
  },
  (effect, sideEffects) =>
    observeCompiler(
      "discovery",
      "sideEffectFailure",
      effect,
      () => ({ diagnostics: 1, entries: sideEffects.length }),
      false,
    ),
);

/**
 * Synchronous compatibility boundary for side-effect diagnostic consumers.
 * @param sideEffects - Ordered detector observations.
 * @param module - Candidate's source path.
 * @param request - Accepted generation identity.
 * @returns A wire-compatible side-effect diagnostic.
 */
export function sideEffectFailure(
  sideEffects: readonly EvaluatorSideEffect[],
  module: string,
  request: EvaluatorRequest,
): EvaluatorFailure {
  return runDiscoverySync(sideEffectFailureEffect(sideEffects, module, request));
}

/**
 * Narrows an opaque native export for external descriptor inspection.
 * @param value - Imported module export.
 * @returns Whether property inspection is supported.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
