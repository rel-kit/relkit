import { Effect } from "effect";
import { httpBoundary, runHttp } from "./http-effect.js";
import { MISSING } from "./request-mapping-body.js";
import type { EffectVisit, MappingState, Path, Visit } from "./request-mapping-object.types.js";
import type { RequestIssueCode } from "./request-mapping.js";
export type { MappingState } from "./request-mapping-object.types.js";

/** Maps object fields sequentially and preserves accumulated validation issues.
 * @param fields - Serialized object-mapping fields evaluated in declaration order.
 * @param state - State owned by the current request or operation.
 * @param path - Ordered validation path or confined resource path.
 * @param visit - Recursive visitor used to evaluate each mapping node.
 * @param report - Issue callback retaining validation paths and public messages.
 * @returns An Effect yielding mapped fields, or MISSING when the field declaration is invalid.
 */
export const mapObjectEffect = Effect.fn("RequestMapping.object")(function* (
  fields: unknown,
  state: MappingState,
  path: Path,
  visit: EffectVisit,
  report: (code: RequestIssueCode, message: string, path: Path) => void,
) {
  if (!isRecord(fields)) {
    report("mapping", "Mapping fields must be an object", path);
    return MISSING;
  }
  const result: Record<string, unknown> = {};
  yield* Effect.forEach(
    Object.entries(fields),
    ([name, node]) =>
      Effect.gen(function* () {
        const valuePath = [...path, name];
        const value = yield* visit(node, state, valuePath);
        if (value === MISSING) {
          if (!state.issues.some((issue) => samePath(issue.path, valuePath)))
            report("missing", `Missing request value "${name}"`, valuePath);
        } else result[name] = value;
      }),
    { discard: true },
  );
  return result;
});

/** Promise compatibility edge for custom mapping visitors.
 * @param fields - Serialized object-mapping fields evaluated in declaration order.
 * @param state - State owned by the current request or operation.
 * @param path - Ordered validation path or confined resource path.
 * @param visit - Recursive visitor used to evaluate each mapping node.
 * @param report - Issue callback retaining validation paths and public messages.
 * @returns The mapped object or MISSING, with validation issues retained in the supplied state.
 */
export function mapObject(
  fields: unknown,
  state: MappingState,
  path: Path,
  visit: Visit,
  report: (code: RequestIssueCode, message: string, path: Path) => void,
): Promise<unknown> {
  return runHttp(
    mapObjectEffect(
      fields,
      state,
      path,
      (...args) => httpBoundary("request.mapping.visit", () => visit(...args)),
      report,
    ),
  );
}

/** Compares validation issue paths by their ordered segments.
 * @param left - First value or path participating in the comparison.
 * @param right - Second value or path participating in the comparison.
 * @returns Whether the value satisfies the required public contract.
 */
function samePath(left: Path, right: Path): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
/** Recognizes a non-null object before reading its named properties.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
