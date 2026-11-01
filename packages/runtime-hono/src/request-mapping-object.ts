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
          if (!state.issues.some((issue) => explains(issue, valuePath, node)))
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

const BODY_ISSUES: readonly string[] = [
  "content-type",
  "body-too-large",
  "malformed-json",
  "malformed-multipart",
];
const BODY_SOURCES: readonly string[] = ["body", "whole-body", "multipart", "multipart-all"];

/** Whether a recorded issue already explains why a field has no value: one at the field itself,
 * or an unreadable body when the field is read from the body.
 * @param issue - Recorded mapping issue.
 * @param path - Path of the field without a value.
 * @param node - The field's serialized mapping node.
 * @returns True when reporting the field as missing would repeat a known problem.
 */
function explains(
  issue: { readonly code: string; readonly path: Path },
  path: Path,
  node: unknown,
) {
  if (samePath(issue.path, path)) return true;
  return issue.path.length === 0 && BODY_ISSUES.includes(issue.code) && readsBody(node);
}

/** Follows optional, default and transform wrappers to the field's request source.
 * @param node - Serialized mapping node.
 * @returns Whether the value comes from the request body.
 */
function readsBody(node: unknown): boolean {
  if (!isRecord(node)) return false;
  if (typeof node.kind === "string" && BODY_SOURCES.includes(node.kind)) return true;
  return "value" in node && readsBody(node.value);
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
