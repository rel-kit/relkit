/** Invocation-local syntax accumulators; no evaluated descriptors or shared state are retained. */
import type { AstCandidateIndicator, AstReExport } from "./ast-prefilter.types.js";
export interface SourceScanState {
  readonly imports: Set<string>;
  readonly factories: Set<string>;
  readonly defaultExports: Set<string>;
  readonly reExports: AstReExport[];
  readonly indicators: Set<AstCandidateIndicator>;
  brandAccess: boolean;
}
