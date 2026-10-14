/** Retains an actual native compiled graph's logical contract while preserving physical graph hashes as separate provenance. */
import { Schema } from "effect";
import { validateGraphShape } from "../../../packages/graph/src/index.js";
import { layoutContract } from "../../../packages/compiler/src/layout-contract.js";
import type { NormalizedGraph } from "../../../packages/compiler/src/normalize-graph-types.js";
import { CheckedCommerceApplication } from "./paired-commerce.schemas.js";

/**
 * Decodes the exact native compiler result and retains every policy, schema, binding and logical resource identity.
 * @param text - The complete native CLI JSON result.
 * @returns Logical comparison contract and independent physical build provenance.
 */
export function commerceGraphContract(text: string) {
  const checked = Schema.decodeUnknownSync(Schema.fromJsonString(CheckedCommerceApplication))(text);
  const value = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(checked.outputs.graph);
  if (!isCompilerGraph(value)) throw new Error("Invalid native compiler output");
  return { logical: layoutContract(value), graphHash: checked.graphHash };
}

/**
 * Grants the compiler's native static projection only after authoritative graph validation.
 * @typeParam Value - Original decoded compiler JSON.
 * @param value - Actual generated graph contract.
 * @returns Whether its complete native graph contract validated.
 */
function isCompilerGraph<Value>(value: Value): value is Value & NormalizedGraph {
  validateGraphShape(value);
  return true;
}
