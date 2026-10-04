/**
 * Current stream lifecycle, latest item, retained item history and original failure.
 * @typeParam Item - Individual declared stream item payload.
 * @typeParam Error - Existing stream failure type exposed to the view.
 */
export interface StreamState<Item, Error> {
  readonly status: "idle" | "starting" | "streaming" | "completed" | "cancelled" | "error";
  readonly items: readonly Item[];
  readonly error?: Error;
}

/**
 * Typed stream state with explicit start and cancellation controls.
 * @typeParam Input - Original declared request payload.
 * @typeParam Item - Individual declared stream item payload.
 * @typeParam Error - Existing stream failure type exposed to the view.
 */
export interface UseStreamResult<Input, Item, Error> extends StreamState<Item, Error> {
  readonly start: (input: Input) => Promise<void>;
  readonly cancel: () => void;
  readonly reset: () => void;
}
