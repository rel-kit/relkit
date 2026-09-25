/** A bounded, immutable event recorded on an invocation span.
 * Dropped attributes count candidates rejected by trace limits.
 * @example const event: TraceEvent = { name: "loaded", time: 1n, attributes: {}, droppedAttributes: 0 };
 */
export interface TraceEvent {
  readonly name: string;
  readonly time: bigint;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly droppedAttributes: number;
}
