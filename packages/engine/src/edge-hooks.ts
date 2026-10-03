/** Deliver advisory edge telemetry without replacing the authoritative result.
 * @typeParam T - Observed callback value.
 * @returns Nothing; failures from advisory callbacks are isolated.
 * @param hook - Optional advisory callback; observer failures cannot change execution.
 * @param value - Native value being validated or projected.
 */
export function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(value);
  } catch {
    // Edge telemetry cannot replace the invocation or provider result.
  }
}
