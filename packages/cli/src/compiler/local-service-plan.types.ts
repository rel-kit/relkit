/** Graph projection containing local provider service declarations. */
export interface LocalServiceGraph {
  readonly nodes: readonly { readonly kind: string; readonly id: string }[];
  readonly edges: readonly { readonly kind: string; readonly from: string; readonly to: string }[];
}

/** Provider node carrying a local service recipe and its graph dependants. */
export interface LocalProviderNode {
  readonly kind: "provider";
  readonly id: string;
  readonly capability: string;
  readonly profile: string;
  readonly local: {
    readonly integrationId: string;
    readonly recipeId: string;
    readonly recipeVersion: number;
  };
}
