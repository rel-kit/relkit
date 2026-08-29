import { isDescriptor } from "@relkit/contracts";
import type {
  EvaluatorCandidate,
  EvaluatorFailure,
  EvaluatorManifestReference,
  EvaluatorModuleResult,
  EvaluatorRequest,
  EvaluatorSideEffect,
} from "./evaluator-protocol.js";
import { snapshotDescriptor, type SnapshotDescriptorLike } from "./evaluator-snapshot.js";

export function snapshotModule(
  module: Record<string, unknown>,
  candidate: EvaluatorCandidate,
  request: EvaluatorRequest,
): EvaluatorModuleResult {
  const exports: EvaluatorModuleResult["exports"][number][] = [];
  const manifestReferences: EvaluatorManifestReference[] = [];
  for (const exportName of Object.keys(module).sort()) {
    const value = module[exportName];
    if (!isCompilerDescriptor(value)) continue;
    const descriptor = snapshotDescriptor(value);
    exports.push({ exportName, descriptor });
    manifestReferences.push({
      generationId: request.generationId,
      descriptorId: descriptor.id,
      kind: descriptor.kind,
      module: candidate.file,
      exportName,
    });
  }
  return {
    file: candidate.file,
    exports: Object.freeze(exports),
    manifestReferences: Object.freeze(manifestReferences),
  };
}

function isCompilerDescriptor(value: unknown): value is SnapshotDescriptorLike {
  if (isDescriptor(value)) return true;
  if (
    !isRecord(value) ||
    (value.kind !== "middleware" && value.kind !== "transform" && value.kind !== "error")
  )
    return false;
  return (
    typeof value.id === "string" &&
    isRecord(value.ref) &&
    value.ref.kind === value.kind &&
    value.ref.id === value.id
  );
}

export function sideEffectFailure(
  sideEffects: readonly EvaluatorSideEffect[],
  module: string,
  request: EvaluatorRequest,
): EvaluatorFailure {
  return {
    code: "RELKIT_EVALUATOR_SIDE_EFFECT",
    message: `Candidate evaluation detected ${sideEffects.length} side effect(s).`,
    generationId: request.generationId,
    module,
    sideEffects,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
