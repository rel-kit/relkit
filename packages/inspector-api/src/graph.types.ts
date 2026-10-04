import type { GRAPH_COLLECTIONS } from "./graph.js";
import type { JsonValue } from "@relkit/contracts";

/** Graph collection vocabulary derived from the declared public collection constant. */
export type GraphCollection = (typeof GRAPH_COLLECTIONS)[number];

/** Selected public graph envelope; nodes and edges are redacted before admission. */
export interface GraphData {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: JsonValue[];
  readonly edges: JsonValue[];
}
