/**
 * What the tool says about history and its collection. An application that stopped answering
 * loses no stored record, so it is told apart from history that cannot be written or read.
 */
import type { InspectorToolState } from "./tool-state.types.js";

/**
 * Tells a failure of the tool's own history (its database, or the collection loop) from one of
 * the application it collects from.
 * @param error - Operation label of the last collection failure.
 * @returns Whether stored history itself is affected.
 */
export function historyFailure(error: string): boolean {
  return error.startsWith("history.") || error === "collection.failed";
}

/**
 * Whether retained history is open and readable.
 * @param current - Tool state.
 * @returns True when history is open and the last failure, if any, was the application's.
 */
export function historyReadable(current: InspectorToolState): boolean {
  return current.history !== undefined && !(current.error && historyFailure(current.error));
}

/** Where collection into history stands; see {@link collectionState}. */
export type CollectionState =
  | "collecting"
  | "waiting-for-application"
  | "application-unreachable"
  | "application-invalid"
  | "history-unavailable";

/**
 * Names where collection stands, for the `/_relkit/v1/storage` answer.
 * @param current - Tool state.
 * @returns `collecting` (connected, the last batch stored), `waiting-for-application` (no
 * session selected, nothing failed), `application-unreachable` (the session stopped answering:
 * retained history stays readable and nothing stored is lost), `application-invalid` (the
 * application answered records the tool could not accept) or `history-unavailable` (history is
 * not open, or writing to it failed).
 */
export function collectionState(current: InspectorToolState): CollectionState {
  if (!historyReadable(current)) return "history-unavailable";
  if (current.error?.startsWith("collection.")) return "application-invalid";
  if (current.error !== undefined) return "application-unreachable";
  return current.selection.state === "connected" ? "collecting" : "waiting-for-application";
}
