/**
 * Holds the function handler table of a generated server behind a stable registry object,
 * so `relkit dev` can replace every handler at once without restarting the process. The
 * generated server passes the stable registry to invocation and keeps its executable
 * manifest object; `swap` replaces the registry and the manifest's `functions` and
 * `targets` entries in one synchronous step, so a request sees either the old table or the
 * new one, never a mix. Requests already running keep the handler they resolved.
 */
import type {
  HandlerTable,
  SwappableHandler,
  SwappableManifest,
  SwappableRegistry,
} from "./dev-handler-table.types.js";
export type { HandlerTable, SwappableManifest } from "./dev-handler-table.types.js";

/**
 * Wraps a verified registry and the manifest whose entries routes resolve per request.
 * @param initial - Registry verified at startup.
 * @param manifest - Executable manifest object the HTTP application reads targets from.
 * @returns The stable registry and the atomic swap operation.
 */
export function createHandlerTable(
  initial: SwappableRegistry,
  manifest: SwappableManifest,
): HandlerTable {
  let current = initial;
  let generation = 0;
  const registry: SwappableRegistry = {
    get graphHash() {
      return current.graphHash;
    },
    get functionIds() {
      return current.functionIds;
    },
    get handlers() {
      return current.handlers;
    },
    get targets() {
      return current.targets;
    },
    get size() {
      return current.size;
    },
    get: (id) => current.get(id),
    has: (id) => current.has(id),
    keys: () => current.keys(),
    values: () => current.values(),
    entries: () => current.entries(),
    forEach: (callback, thisArg) => {
      current.forEach((handler: SwappableHandler, id: string) =>
        callback.call(thisArg, handler, id, registry),
      );
    },
    [Symbol.iterator]: () => current.entries(),
  };
  return {
    registry,
    get generation() {
      return generation;
    },
    swap: (next, nextManifest) => {
      replaceEntries(manifest.functions, nextManifest.functions);
      replaceEntries(manifest.targets, nextManifest.targets);
      current = next;
      generation += 1;
    },
  };
}

/**
 * Replaces a manifest map's entries in place, so holders of the object see the new table.
 * @param target - Mutable map owned by the running server.
 * @param source - Entries of the new generation.
 */
function replaceEntries<Value>(
  target: Record<string, Value> | undefined,
  source: Readonly<Record<string, Value>> | undefined,
): void {
  if (target === undefined) return;
  for (const key of Object.keys(target)) if (source?.[key] === undefined) delete target[key];
  Object.assign(target, source ?? {});
}
