export function notify<T>(hook: ((value: T) => void) | undefined, value: T): void {
  try {
    hook?.(value);
  } catch {
    // Edge telemetry cannot replace the invocation or provider result.
  }
}
