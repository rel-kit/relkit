import type { NormalizedDescriptor } from "./normalize-types.js";

/** Shared stable identity and provenance fields for graph node projections. */
export interface GraphNodeBase {
  readonly id: string;
  readonly source: NormalizedDescriptor["source"];
  readonly domainId?: string;
}
