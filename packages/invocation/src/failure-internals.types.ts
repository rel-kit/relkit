/** Private cause and stack metadata stored off a public failure object.
 * This detail must not be sent in a public failure envelope.
 * @example const detail: FailureDetail = { cause: error, stack: error.stack };
 */
export interface FailureDetail {
  readonly cause?: unknown;
  readonly stack?: string;
}

/** Mutable detail registry isolated by an Effect Layer when required.
 * Its weak keys let discarded failure objects be collected.
 * @example const layer = Layer.succeed(FailureDetailStore, { details: new WeakMap() });
 */
export interface FailureDetailStoreService {
  readonly details: WeakMap<object, FailureDetail>;
}
