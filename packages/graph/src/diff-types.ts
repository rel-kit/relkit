import type { JsonValue, SourceLocation } from "@relkit/contracts";

export const GRAPH_DIFF_CLASSIFICATIONS = [
  "informational",
  "compatible",
  "potentially-breaking",
  "breaking",
] as const;
export type * from "./diff-types.types.js";
