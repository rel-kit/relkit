import { HISTORY_UNAVAILABLE_TEXT } from "./history-status";

/**
 * What a signal list says where it has no rows. A list that could not be read is not an empty one.
 * @param kind - What the list holds.
 * @param unavailable - History cannot be read.
 * @returns The sentence for the empty list.
 */
export function emptySignalText(kind: "log" | "trace", unavailable: boolean): string {
  return unavailable ? HISTORY_UNAVAILABLE_TEXT : `No correlated ${kind}s are retained.`;
}
