import type { NativeGate } from "./native-gate.types.js";

/** Creates a native boundary fixture without a timer. @typeParam T - Native result.
 * @returns A Promise with explicit settlement callbacks for ownership tests. */
export function nativeGate<T>(): NativeGate<T> {
  /** Publishes native success. @param value - Fixture result. @returns After Promise settlement. */
  let complete: (value: T) => void = () => undefined;
  /** Publishes native rejection. @param error - Original failure. @returns After Promise settlement. */
  let fail: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return { promise, complete, fail };
}
