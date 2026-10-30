/** Applies the canvas filters to a view and counts the cards each filter governs. */
import { type FilterId, FILTERS, filterForCategory } from "./graph-semantics";
import type { GraphView, ViewNode, ViewOptions } from "./graph-views.types";

/** Turns a selection ("show only these") into the kinds to remove. */
export function resolveFilters(options: ViewOptions): {
  readonly hidden: ReadonlySet<FilterId>;
  readonly keepGuarded: boolean;
} {
  const only = options.only ?? new Set<FilterId>();
  if (only.size === 0) return { hidden: options.hidden ?? new Set(), keepGuarded: false };
  const hidden = new Set<FilterId>(
    FILTERS.map((filter) => filter.id).filter((id) => id !== "middleware" && !only.has(id)),
  );
  for (const id of options.hidden ?? []) hidden.add(id);
  return { hidden, keepGuarded: only.has("middleware") };
}

/** Cards each filter governs; parents (domain containers) and responses are not filterable. */
export function countFilters(view: GraphView): Partial<Record<FilterId, number>> {
  const counts: Partial<Record<FilterId, number>> = {};
  const guarded = view.nodes.filter((node) => (node.guards?.length ?? 0) > 0).length;
  if (guarded > 0) counts.middleware = guarded;
  for (const node of view.nodes) {
    if (!filterable(view, node)) continue;
    const filter = filterForCategory(node.category);
    if (filter !== undefined) counts[filter] = (counts[filter] ?? 0) + 1;
  }
  return counts;
}

function filterable(view: GraphView, node: ViewNode): boolean {
  if (view.nodes.some((child) => child.parentId === node.id)) return false;
  if (node.type === "response") return node.category === "error";
  return true;
}

/** Removes the cards of switched-off filters and every edge that touched them. */
export function applyFilters(
  view: GraphView,
  hidden: ReadonlySet<FilterId>,
  keepGuarded = false,
): GraphView {
  if (hidden.size === 0) return view;
  const hiddenCategories = new Set(
    FILTERS.filter((filter) => hidden.has(filter.id) && filter.id !== "middleware").flatMap(
      (filter) => filter.categories,
    ),
  );
  const removed = new Set(
    view.nodes
      .filter(
        (node) =>
          filterable(view, node) &&
          hiddenCategories.has(node.category) &&
          !(keepGuarded && (node.guards?.length ?? 0) > 0),
      )
      .map((node) => node.id),
  );
  if (removed.size === 0) return view;
  const nodes = view.nodes.filter((node) => !removed.has(node.id));
  const edges = view.edges.filter((edge) => !removed.has(edge.from) && !removed.has(edge.to));
  const stages = view.stages?.filter(
    (stage) => stage.note !== undefined || nodes.some((node) => node.stage === stage.id),
  );
  return { ...view, nodes, edges, ...(stages === undefined ? {} : { stages }) };
}

/** Counts what each filter governs, then removes what is switched off. */
export function finish(view: GraphView, options: ViewOptions): GraphView {
  const { hidden, keepGuarded } = resolveFilters(options);
  return applyFilters({ ...view, available: countFilters(view) }, hidden, keepGuarded);
}
