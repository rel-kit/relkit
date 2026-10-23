/**
 * Describes native module-resolution edges consumed by the declaration and
 * artifact collectors. Paths identify actual files rather than install-only edges.
 */
export interface ConsumerModuleEdge {
  readonly from: string;
  readonly to: string;
}
