/**
 * Leaves out of the native document an operation the configured instance does not serve. The SDK's
 * generator lists the endpoints of the enabled plugins only, so the one case is an endpoint the
 * router matches but a setting turns off: it answers 405 to every request.
 */
import type { JsonValue } from "relkit/contracts";

/** Settings of the activated instance that turn a documented operation off. */
export interface ServedOperations {
  /** `session.deferSessionRefresh`: without it `POST /get-session` answers 405. */
  readonly sessionByPost: boolean;
}

/**
 * Removes the operations the instance answers 405 to.
 * @param document - Native generator output, before its paths are mounted.
 * @param served - Settings read from the activated instance.
 * @returns The same document when nothing is removed, otherwise a copy without the operation.
 */
export function withoutUnservedOperations(
  document: JsonValue,
  served: ServedOperations,
): JsonValue {
  if (served.sessionByPost || !isRecord(document) || !isRecord(document.paths)) return document;
  const session = document.paths["/get-session"];
  if (!isRecord(session) || session.post === undefined) return document;
  const { post: _post, ...kept } = session;
  return { ...document, paths: { ...document.paths, "/get-session": kept } };
}

/** Recognizes JSON objects before reading their properties. */
function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
