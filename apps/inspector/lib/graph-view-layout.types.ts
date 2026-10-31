/** Shapes a laid-out explorer view is described with: placed cards, stages and edge routes. */
/** Main reading direction of a view. */
export type LayoutDirection = "down" | "right";

export interface PlacedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parentId?: string;
}

export interface PlacedStage {
  readonly id: string;
  readonly label: string;
  readonly note?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Column header above a stage (left to right) or row label beside it (top to bottom). */
  readonly orientation: "column" | "row";
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ViewLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly stages: readonly PlacedStage[];
  /** Routed edge polylines in absolute coordinates, keyed by edge id (ELK views only). */
  readonly routes: ReadonlyMap<string, readonly Point[]>;
  /** Centre of each edge label the layout reserved space for, absolute coordinates. */
  readonly labels: ReadonlyMap<string, Point>;
  readonly direction: LayoutDirection;
}
