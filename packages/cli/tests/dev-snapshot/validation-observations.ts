/**
 * Replays compiler metadata queries over the validation fixture's byte storage.
 * No native directories are read; files and directory membership derive from
 * the explicit map so additions and deletions remain independently controllable.
 */
import { Effect } from "effect";
import type { TypecheckObservation } from "../../src/dev-snapshot/snapshot-files.types.js";

/**
 * Supplies current query results through the same native file authority contract.
 * @param bytes - Test-owned complete file storage.
 * @param root - Relocated fixture root.
 * @param queries - Original check's ordered metadata witnesses.
 * @returns Lazy complete observations with no timestamp or expected-value shortcut.
 */
export function fixtureObservations(
  bytes: ReadonlyMap<string, string>,
  root: string,
  queries: readonly TypecheckObservation[],
) {
  return Effect.sync(() =>
    queries.map((query) => {
      const path = query.path === "." ? root : `${root}/${query.path}`;
      if (query.kind === "fileExists") return { ...query, exists: bytes.has(path) };
      const descendants = [...bytes.keys()].filter((key) => key.startsWith(path + "/"));
      if (query.kind === "directoryExists") return { ...query, exists: descendants.length > 0 };
      const entries = [
        ...new Set(
          descendants.flatMap((child) => {
            const local = child.slice(path.length + 1);
            const separator = local.indexOf("/");
            return separator < 0 ? [] : [local.slice(0, separator)];
          }),
        ),
      ].sort();
      return { ...query, entries };
    }),
  );
}
