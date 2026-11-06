import type { ApiTreeEntry, ApiErrorType } from "./generate-api-tree.types.js";
import { clientApiPaths } from "relkit/contracts";
export type { ApiTreeEntry, ApiErrorType } from "./generate-api-tree.types.js";

/** Branch of rendered API leaves keyed by property name. */
type Branch = Map<string, Branch | string>;

/**
 * Renders the `ClientApi` augmentation that types the generated `api` object.
 * @param entries - Public routes with their rendered contract types.
 * @returns A `declare module "@relkit/client"` block, or an empty string without routes.
 * @example apiTreeSource([{ id: "route.get.orders", method: "GET", path: "/orders", targetFunctionId: "orders.list", type: "X" }]);
 */
export function apiTreeSource(entries: readonly ApiTreeEntry[]): string {
  const paths = clientApiPaths(entries);
  const root: Branch = new Map();
  for (const entry of entries) {
    const path = paths.get(entry.id);
    if (path === undefined) continue;
    let branch: Branch | undefined = root;
    for (const segment of path.slice(0, -1)) {
      const next: Branch | string = branch.get(segment) ?? new Map();
      branch.set(segment, next);
      branch = typeof next === "string" ? undefined : next;
      if (branch === undefined) break;
    }
    const leaf = path.at(-1)!;
    if (branch !== undefined && !branch.has(leaf))
      branch.set(leaf, `import("@relkit/client").ApiRoute<${entry.type}>`);
  }
  return [
    'declare module "@relkit/client" {',
    "  interface ClientApi {",
    ...renderBranch(root, "    "),
    "  }",
    "}",
    "",
  ].join("\n");
}

/**
 * Renders one branch's members in name order.
 * @param branch - Branch to render.
 * @param indent - Leading whitespace for this level.
 * @returns Source lines.
 */
function renderBranch(branch: Branch, indent: string): string[] {
  const lines: string[] = [];
  for (const [name, value] of [...branch].sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof value === "string") {
      lines.push(`${indent}readonly ${JSON.stringify(name)}: ${value};`);
      continue;
    }
    lines.push(`${indent}readonly ${JSON.stringify(name)}: {`);
    lines.push(...renderBranch(value, `${indent}  `));
    lines.push(`${indent}};`);
  }
  return lines;
}

/**
 * Renders a route's error union: one member per declared error, keyed by `code`, plus the
 * framework's own errors.
 * @param errors - Declared errors with their HTTP status and rendered data type.
 * @returns The TypeScript union type.
 * @example apiErrorUnion([{ code: "orders.not-found", status: 404, data: "{ orderId: string }" }]);
 */
export function apiErrorUnion(errors: readonly ApiErrorType[]): string {
  const declared = [...errors]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map(
      (error) =>
        `import("@relkit/client").RelkitDeclaredError<${JSON.stringify(error.code)}, ${error.status ?? "number"}, ${error.data}>`,
    );
  return [...declared, 'import("@relkit/client").RelkitUndeclaredError'].join(" | ");
}
