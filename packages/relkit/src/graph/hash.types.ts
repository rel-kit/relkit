/** Options for portable graph canonicalization.
 * @example const options: GraphCanonicalizationOptions = { projectRoot: "/app" };
 */
export interface GraphCanonicalizationOptions {
  readonly projectRoot?: string;
}

/** Minimal input accepted by graph hashing and canonicalization.
 * @remarks Node and edge contents are checked during canonicalization.
 * @example const graph: GraphShape = { contractVersion: 3, nodes: [], edges: [] };
 */
export interface GraphShape {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
}
