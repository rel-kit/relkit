/** Display semantics for graph node and edge kinds: names, groups, tokens and labels. */
import type { GraphNode } from "./graph-model";
import { capabilityKind, isListener, isRoute, routeStreams } from "./graph-node-meta";

export type { EdgeGroup, EdgeSemantics } from "./graph-semantics-edges";
export {
  EDGE_GROUP_LABELS,
  EDGE_SEMANTICS,
  edgeGroup,
  edgeReverseVerb,
  edgeSemantics,
  edgeVerb,
  isHiddenEdge,
} from "./graph-semantics-edges";

/** Visual category a node renders as; drives icon, colour token and card shape. */
export type NodeCategory =
  | "app"
  | "service"
  | "route"
  | "stream"
  | "middleware"
  | "auth"
  | "database"
  | "function"
  | "listener"
  | "event"
  | "channel"
  | "table"
  | "agent"
  | "tool"
  | "error"
  | "platform";

export interface NodeCategoryMeta {
  readonly label: string;
  readonly plural: string;
  /** CSS custom property (without `var()`) carrying the category colour. */
  readonly token: string;
}

export const NODE_CATEGORIES: Readonly<Record<NodeCategory, NodeCategoryMeta>> = {
  app: { label: "Application", plural: "Applications", token: "--kind-service" },
  service: { label: "Domain", plural: "Domains", token: "--kind-service" },
  route: { label: "Route", plural: "Routes", token: "--kind-route" },
  stream: { label: "Streaming route", plural: "Streaming routes", token: "--kind-stream" },
  middleware: { label: "Middleware", plural: "Middleware", token: "--kind-middleware" },
  auth: { label: "Auth", plural: "Auth", token: "--kind-auth" },
  database: { label: "Database", plural: "Databases", token: "--kind-table" },
  function: { label: "Function", plural: "Functions", token: "--kind-function" },
  listener: { label: "Listener", plural: "Listeners", token: "--kind-event" },
  event: { label: "Event", plural: "Events", token: "--kind-event" },
  channel: { label: "Channel", plural: "Channels", token: "--kind-channel" },
  table: { label: "Table", plural: "Tables", token: "--kind-table" },
  agent: { label: "Agent", plural: "Agents", token: "--kind-agent" },
  tool: { label: "Tool", plural: "Tools", token: "--kind-tool" },
  error: { label: "Error", plural: "Errors", token: "--kind-error" },
  platform: { label: "Platform", plural: "Platform", token: "--kind-platform" },
};

export function nodeCategory(node: GraphNode): NodeCategory {
  switch (node.kind) {
    case "app":
      return "app";
    case "service": {
      const capability = capabilityKind(node);
      if (capability === "drizzle") return "database";
      if (capability === "better-auth") return "auth";
      return "service";
    }
    case "middleware":
      return "middleware";
    case "trigger":
      if (isRoute(node)) return routeStreams(node) ? "stream" : "route";
      return isListener(node) ? "listener" : "route";
    case "route-group":
      return "route";
    case "function":
    case "task":
      return "function";
    case "event":
      return "event";
    case "channel":
      return "channel";
    case "table":
      return "table";
    case "agent":
    case "graph":
      return "agent";
    case "tool":
      return "tool";
    case "error":
      return "error";
    default:
      return "platform";
  }
}

export function nodeKindLabel(node: GraphNode): string {
  if (node.kind === "job") return "Job";
  if (node.kind === "task") return "Task";
  if (node.kind === "bucket") return "Bucket";
  if (node.kind === "cache") return "Cache";
  if (node.kind === "env") return "Environment";
  if (node.kind === "provider") return "Provider";
  if (node.kind === "middleware") return "Middleware";
  if (node.kind === "hook") return "Hook";
  if (node.kind === "graph") return "Agent graph";
  if (node.kind === "route-group") return "Route group";
  return NODE_CATEGORIES[nodeCategory(node)].label;
}

/** Node kinds that belong to the platform layer rather than to a business domain. */
export const PLATFORM_KINDS: ReadonlySet<string> = new Set([
  "env",
  "provider",
  "error",
  "middleware",
  "hook",
  "app",
]);

/** Canvas filters: one icon toggle each, mapped to the node categories it shows or hides. */
export type FilterId =
  | "routes"
  | "streams"
  | "middleware"
  | "auth"
  | "services"
  | "functions"
  | "listeners"
  | "events"
  | "channels"
  | "agents"
  | "tools"
  | "data"
  | "errors";

export interface FilterDefinition {
  readonly id: FilterId;
  readonly label: string;
  readonly categories: readonly NodeCategory[];
}

export const FILTERS: readonly FilterDefinition[] = [
  { id: "routes", label: "Routes", categories: ["route"] },
  { id: "streams", label: "Streaming routes", categories: ["stream"] },
  { id: "middleware", label: "Middleware", categories: ["middleware"] },
  { id: "auth", label: "Auth", categories: ["auth"] },
  { id: "services", label: "Services", categories: ["service"] },
  { id: "functions", label: "Functions", categories: ["function"] },
  { id: "listeners", label: "Listeners", categories: ["listener"] },
  { id: "events", label: "Events", categories: ["event"] },
  { id: "channels", label: "Channels", categories: ["channel"] },
  { id: "agents", label: "Agents", categories: ["agent"] },
  { id: "tools", label: "Tools", categories: ["tool"] },
  { id: "data", label: "Database & tables", categories: ["database", "table"] },
  { id: "errors", label: "Errors", categories: ["error"] },
];

const FILTER_IDS: ReadonlySet<string> = new Set(FILTERS.map((filter) => filter.id));

export function isFilterId(value: string): value is FilterId {
  return FILTER_IDS.has(value);
}

export function filterForCategory(category: NodeCategory): FilterId | undefined {
  return FILTERS.find((filter) => filter.categories.includes(category))?.id;
}
