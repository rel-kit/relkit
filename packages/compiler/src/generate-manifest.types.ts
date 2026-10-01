import type { Diagnostic } from "@relkit/diagnostics";

import type { NormalizedDescriptor, NormalizedGraph } from "./normalize-types.js";

/** Accepted graph evidence and executable descriptor bindings used by manifest rendering. */
export interface ManifestGenerationInput {
  readonly graph?: NormalizedGraph;
  readonly graphHash: string;
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly middleware?: readonly NormalizedDescriptor[];
  readonly transforms?: readonly NormalizedDescriptor[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly projectRoot?: string;
  readonly generatedDirectory?: string;
}

/** Executable source and diagnostics with activation eligibility. */
export interface GeneratedManifest {
  readonly source: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly activatable: boolean;
}
