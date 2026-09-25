/** Limits on recorded trace data and in-memory span state.
 * Each count and byte budget is normalized before a span runtime uses it.
 * @example const limits = traceLimits({ events: 100, activeSpans: 32 });
 */
export interface TraceLimits {
  readonly spansPerTrace: number;
  readonly attributes: number;
  readonly events: number;
  readonly links: number;
  readonly updates: number;
  readonly attributeBytes: number;
  readonly activeSpans: number;
  readonly nameBytes: number;
  readonly keyBytes: number;
}
