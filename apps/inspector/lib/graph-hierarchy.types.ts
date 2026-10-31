/** Shapes of the grouped application graph: domains, platform resources and ownership indexes. */
import type { GraphEdge, GraphNode } from "./graph-model";

export interface DomainGroup {
  readonly id: string;
  readonly service: GraphNode;
  readonly routes: readonly GraphNode[];
  readonly functions: readonly GraphNode[];
  readonly listeners: readonly GraphNode[];
  readonly events: readonly GraphNode[];
  readonly channels: readonly GraphNode[];
  readonly tools: readonly GraphNode[];
  readonly agents: readonly GraphNode[];
  readonly jobs: readonly GraphNode[];
  /** Every node owned by this domain, including the service itself. */
  readonly members: readonly GraphNode[];
  /** Synthetic card standing for all of this domain's HTTP routes. */
  readonly routeGroup?: GraphNode;
}

export interface PlatformGroup {
  readonly database?: GraphNode;
  readonly tables: readonly GraphNode[];
  readonly auth?: GraphNode;
  readonly routes: readonly GraphNode[];
  /** Synthetic card for platform-owned routes (for example the auth handler). */
  readonly routeGroup?: GraphNode;
  readonly providers: readonly GraphNode[];
  readonly env: readonly GraphNode[];
  readonly errors: readonly GraphNode[];
  readonly middleware: readonly GraphNode[];
  readonly other: readonly GraphNode[];
}

export interface AppHierarchy {
  readonly app?: GraphNode;
  readonly appId: string;
  readonly domains: readonly DomainGroup[];
  readonly platform: PlatformGroup;
  /** Every node, including synthesised table nodes. */
  readonly nodes: ReadonlyMap<string, GraphNode>;
  /** Declared edges with `uses-table` edges re-targeted to table nodes. */
  readonly edges: readonly GraphEdge[];
  readonly outgoing: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly GraphEdge[]>;
  /** Owning group id (domain service id, or `PLATFORM_OWNER`) per node. */
  readonly ownerOf: ReadonlyMap<string, string>;
  /** True when the generation records function → table access. */
  readonly hasTableUsage: boolean;
  /** True when the generation records function → function calls. */
  readonly hasCallGraph: boolean;
}
