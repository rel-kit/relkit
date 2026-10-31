/** Shapes shared by the explorer views: view nodes, edges, stages and view options. */
import type { GraphEdge, GraphNode } from "./graph-model";
import type { Access } from "./graph-hierarchy";
import type { EdgeGroup, FilterId, NodeCategory } from "./graph-semantics";

export type ViewMode = "architecture" | "domain" | "flow";
export type ViewNodeType = "service" | "item" | "table" | "stub" | "response";

export interface ViewNode {
  readonly id: string;
  readonly type: ViewNodeType;
  readonly category: NodeCategory;
  readonly title: string;
  readonly subtitle?: string;
  readonly badges?: readonly string[];
  readonly counts?: readonly { readonly label: string; readonly value: number }[];
  readonly node?: GraphNode;
  /** Compound parent (view node id) for ELK hierarchical layout. */
  readonly parentId?: string;
  /** Flow stage id. */
  readonly stage?: string;
  /** Owning domain id, shown as a chip on stubs. */
  readonly domainId?: string;
  /** Pin to the first or last layer of the layout (route groups on top, database at the end). */
  readonly rank?: "first" | "last";
  /**
   * Shared platform service (auth, database, providers): laid out in a column beside the
   * hierarchy instead of inside it, because nearly every domain reaches it.
   */
  readonly side?: boolean;
  /** What a route requires before its handler runs. */
  readonly access?: Access;
  /** Middleware a route (or any route in a group) passes through, in order, by name. */
  readonly guards?: readonly string[];
  /** Plain-language description of the guards, used as the lock's tooltip. */
  readonly guardNote?: string;
}

export interface ViewEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly group: EdgeGroup;
  readonly label: string;
  readonly count?: number;
  readonly edges: readonly GraphEdge[];
  /** Middleware the requests on this edge pass through, in order, by name. */
  readonly guards?: readonly string[];
  /** Plain-language description of the guards, used as the lock's tooltip. */
  readonly guardNote?: string;
}

export interface ViewStage {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
}

export interface GraphView {
  readonly mode: ViewMode;
  readonly title: string;
  readonly subtitle: string;
  readonly focusId?: string;
  readonly nodes: readonly ViewNode[];
  readonly edges: readonly ViewEdge[];
  readonly stages?: readonly ViewStage[];
  /** How many cards each filter governs in this view, before filters are applied. */
  readonly available: Readonly<Partial<Record<FilterId, number>>>;
}

export interface ViewOptions {
  /** Show providers, environment and other platform-layer nodes. */
  readonly platform?: boolean;
  /** Filters switched off: their cards are removed (or folded into domain arrows on the map). */
  readonly hidden?: ReadonlySet<FilterId>;
  /**
   * Filters selected in the bar. When any are selected, only those kinds stay on the canvas;
   * "middleware" keeps the routes that pass through middleware. Empty means show everything.
   */
  readonly only?: ReadonlySet<FilterId>;
}
