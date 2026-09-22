import { passOutputs, sortDiagnostics } from "./normalize-finalize.js";
import { createDiagnostic } from "@relkit/diagnostics";
import {
  passAgents,
  passCollisions,
  passEventTargets,
  passEvents,
  passExtract,
  passGraph,
  passIndex,
  passJobs,
  passLocal,
  passNormalize,
  passProviders,
  passReferences,
  passRoutes,
  passSchemas,
  passSources,
  passTools,
} from "./normalize-passes.js";
import {
  EMPTY_OUTPUTS,
  NORMALIZE_CODES,
  VALIDATION_PASSES,
  type NormalizeInput,
  type NormalizationResult,
  type NormalizationWork,
  type ValidationPass,
} from "./normalize-types.js";
import { createWatchDependencyIndex } from "./watch.js";

export * from "./normalize-types.js";

/** Runs the exact v3 Section 11.4 compiler passes in their specified order. */
export function normalizeCompilation(input: NormalizeInput = {}): NormalizationResult {
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
  const passes: readonly (() => void)[] = [
    () => passExtract(work),
    () => passSources(work),
    () => passNormalize(work),
    () => passLocal(work),
    () => passIndex(work),
    () => passReferences(work),
    () => passSchemas(work),
    () => passRoutes(work),
    () => passJobs(work),
    () => passEvents(work),
    () => passEventTargets(work),
    () => passTools(work),
    () => passAgents(work),
    () => passProviders(work),
    () => passCollisions(work),
    () => passGraph(work),
    () => passOutputs(work),
  ];
  passes.forEach((run, index) => {
    const pass = VALIDATION_PASSES[index] as ValidationPass;
    work.passOrder.push(pass);
    input.onPass?.(pass, index + 1);
    try {
      run();
    } catch (error) {
      work.diagnostics.push(
        createDiagnostic({
          code: "RELKIT_NORMALIZATION_FAILED",
          severity: "error",
          message: `${pass} failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  });
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
    watch: createWatchDependencyIndex(work.descriptors),
    activatable: work.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
}

/** Alias used by compiler callers that describe the input as descriptor values. */
export const normalizeDescriptors = normalizeCompilation;

/** Short alias for the compiler normalization entrypoint. */
export const normalize = normalizeCompilation;
