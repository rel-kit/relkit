import type { JsonValue, SourceLocation } from "../contracts/index.js";

export const GRAPH_DIFF_CLASSIFICATIONS = [
  "informational",
  "compatible",
  "potentially-breaking",
  "breaking",
] as const;
export type * from "./diff-types.types.js";
