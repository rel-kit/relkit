import type { AnyProcedure } from "@orpc/server";
import type { HttpTriggerRegistration } from "../graph/index.js";
import { clientApiPaths } from "../contracts/client-api.js";

/** Nested procedures addressed by the typed client's `api` object. */
type ApiTree = { [name: string]: AnyProcedure | ApiTree };

/**
 * Mounts each route procedure at its typed-client API path, such as `orders.getOrder`.
 * @param triggers - Public client routes.
 * @param procedures - Route procedures keyed by trigger ID.
 * @returns The nested API tree; paths that collide with a branch are left out.
 */
export function rpcApiTree(
  triggers: readonly HttpTriggerRegistration[],
  procedures: ReadonlyMap<string, AnyProcedure>,
): ApiTree {
  const paths = clientApiPaths(
    triggers.map((trigger) => ({
      id: trigger.id,
      method: trigger.config.method,
      path: trigger.config.path,
      targetFunctionId: trigger.targetFunctionId,
    })),
  );
  const tree: ApiTree = {};
  for (const [id, path] of paths) {
    const value = procedures.get(id);
    if (value === undefined) continue;
    let branch: ApiTree | undefined = tree;
    for (const segment of path.slice(0, -1)) {
      const next: AnyProcedure | ApiTree = branch[segment] ?? {};
      branch[segment] = next;
      branch = isBranch(next) ? next : undefined;
      if (branch === undefined) break;
    }
    const leaf = path.at(-1)!;
    if (branch !== undefined && branch[leaf] === undefined) branch[leaf] = value;
  }
  return tree;
}

/**
 * Tells a nested branch from an oRPC procedure.
 * @param value - Tree entry.
 * @returns Whether the entry is a plain branch object.
 */
function isBranch(value: AnyProcedure | ApiTree): value is ApiTree {
  return !("~orpc" in value);
}
