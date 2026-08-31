import type { JsonValue, SourceLocation } from "@relkit/contracts";

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
  | "event"
  | "job"
  | "bucket/cache"
  | "tool"
  | "agent"
  | "profile"
  | "service";
export type GraphDiffChange = "added" | "removed" | "changed" | "source-moved";

export interface GraphChange {
  readonly category: GraphDiffCategory;
  readonly kind: string;
  readonly id: string;
  readonly change: GraphDiffChange;
  readonly classification: GraphDiffClassification;
  readonly fields: readonly string[];
  readonly details: readonly string[];
  readonly source?: { readonly before: SourceLocation; readonly after: SourceLocation };
  readonly before?: JsonValue;
  readonly after?: JsonValue;
}

export interface GraphDiff {
  readonly changes: readonly GraphChange[];
  readonly hasBreakingChanges: boolean;
  readonly highestClassification: GraphDiffClassification | undefined;
}
