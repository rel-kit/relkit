/** Explicitly settled native fixture; tests settle every gate before releasing its owner. @typeParam T - Native result. */
export interface NativeGate<T> {
  readonly promise: Promise<T>;
  /** Completes native work. @param value - Original native result. */
  readonly complete: (value: T) => void;
  /** Rejects native work. @param error - Original native failure. */
  readonly fail: (error: unknown) => void;
}
