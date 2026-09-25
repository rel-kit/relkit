import type { JsonValue, SourceLocation } from "@relkit/contracts";
import type { GRAPH_DIFF_CLASSIFICATIONS } from "./diff-types.js";

/**
 * Compatibility severity assigned to a graph change.
 * @remarks Diffing compares canonical contract data and ignores source-only moves for compatibility.
 * @example const inspect = (value: GraphDiffClassification): void => { console.log(value); };
 */
export type GraphDiffClassification = (typeof GRAPH_DIFF_CLASSIFICATIONS)[number];

/**
 * Runtime capability family used to group graph changes.
 * @remarks Diffing compares canonical contract data and ignores source-only moves for compatibility.
 * @example const inspect = (value: GraphDiffCategory): void => { console.log(value); };
 */
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
/**
 * Structural change kind in a graph diff.
 * @remarks Diffing compares canonical contract data and ignores source-only moves for compatibility.
 * @example const inspect = (value: GraphDiffChange): void => { console.log(value); };
 */
export type GraphDiffChange = "added" | "removed" | "changed" | "source-moved";

/**
 * One ordered graph contract change with before and after values.
 * @remarks Diffing compares canonical contract data and ignores source-only moves for compatibility.
 * @example const inspect = (value: GraphChange): void => { console.log(value); };
 */
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

/**
 * Complete compatibility report between two graph documents.
 * @remarks Diffing compares canonical contract data and ignores source-only moves for compatibility.
 * @example const inspect = (value: GraphDiff): void => { console.log(value); };
 */
export interface GraphDiff {
  readonly changes: readonly GraphChange[];
  readonly hasBreakingChanges: boolean;
  readonly highestClassification: GraphDiffClassification | undefined;
}
