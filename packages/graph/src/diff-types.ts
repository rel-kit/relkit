import type { JsonValue, SourceLocation } from "@zsys/contracts";

export const GRAPH_DIFF_CLASSIFICATIONS = [
  "informational",
  "compatible",
  "potentially-breaking",
  "breaking",
] as const;
export type GraphDiffClassification = (typeof GRAPH_DIFF_CLASSIFICATIONS)[number];

export type GraphDiffCategory =
  | "route"
  | "function/error"
  | "event/selector"
  | "job"
  | "bucket/cache"
  | "tool"
  | "agent"
  | "profile";
export type GraphDiffChange = "added" | "removed" | "changed" | "source-moved";

export interface SelectorExpansionDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface GraphChange {
  readonly category: GraphDiffCategory;
  readonly kind: string;
  readonly id: string;
  readonly change: GraphDiffChange;
  readonly classification: GraphDiffClassification;
  readonly fields: readonly string[];
  readonly details: readonly string[];
  readonly source?: { readonly before: SourceLocation; readonly after: SourceLocation };
  readonly selectorExpansion?: SelectorExpansionDiff;
  readonly before?: JsonValue;
  readonly after?: JsonValue;
}

export interface GraphDiff {
  readonly changes: readonly GraphChange[];
  readonly hasBreakingChanges: boolean;
  readonly highestClassification: GraphDiffClassification | undefined;
}
