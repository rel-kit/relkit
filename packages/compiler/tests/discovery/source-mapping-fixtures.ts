import type { EvaluatorModuleResult } from "../../src/discovery/evaluator-protocol.js";
import * as Models from "../../src/discovery/evaluator-protocol-schema.js";

/**
 * Builds evaluator snapshots with existing references for source-mapping tests.
 * @param file - Project-relative source path.
 * @param exports - Runtime export names to associate with the source.
 * @returns Data-only module snapshots bound to the original generation.
 */
export function moduleSnapshot(file: string, exports: readonly string[]): EvaluatorModuleResult {
  return Models.EvaluatorModuleResult.make({
    file,
    exports: exports.map((exportName) => ({
      exportName,
      descriptor: {
        kind: "function",
        id: exportName,
        ref: { kind: "function", id: exportName },
        metadata: {},
      },
    })),
    manifestReferences: exports.map((exportName) => ({
      generationId: "original",
      descriptorId: exportName,
      kind: "function",
      module: file,
      exportName,
    })),
  });
}
