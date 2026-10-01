import type { GenericFunction, MutableRecord, Restore } from "./evaluator-detector-native.types.js";

/**
 * Replaces a native method and registers its rollback before attempting the assignment.
 * @param target - Native object exclusively owned by the active detector session.
 * @param name - Property whose invocation is intercepted.
 * @param replacement - Synchronous adapter required by the native API.
 * @param restores - Owner's reverse-order release capabilities.
 * @returns Nothing; the caller's Effect scope owns the registered rollback.
 * @remarks Assignment failures are defects. Registering first also covers setters that mutate and throw.
 */
export function replaceNative(
  target: MutableRecord,
  name: string,
  replacement: GenericFunction,
  restores: Restore[],
): void {
  const original = target[name];
  restores.push(() => {
    target[name] = original;
  });
  target[name] = replacement;
}
