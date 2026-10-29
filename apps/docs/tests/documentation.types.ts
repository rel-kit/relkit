/** Describes the narrow native configuration projections checked by documentation tests. */
export interface DocumentationCoverage {
  readonly features: readonly { readonly id: string }[];
  readonly guides: readonly { readonly path: string }[];
}
