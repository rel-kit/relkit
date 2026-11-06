/**
 * Keeps public failure identity stable across package copies. A bundled server and
 * an external integration (runtime-hono transports, drizzle, better-auth) may each
 * load their own copy of this package; plain `instanceof` would then classify a
 * declared failure from one copy as a defect in the other.
 */

/** Global registry key shared by every copy of this package. */
const SHARED_STATE = Symbol.for("@relkit/invocation/shared-state");

type IdentityTarget = abstract new (...args: never[]) => object;

/**
 * Makes `instanceof` on the exact class accept instances from another package copy.
 * Subclasses keep native prototype semantics.
 * @param type - Class whose instances cross package-copy boundaries.
 * @param key - Stable, versionless identity key.
 * @example brandAcrossCopies(RuntimeFailure, "@relkit/invocation/RuntimeFailure");
 */
export function brandAcrossCopies(type: IdentityTarget, key: string): void {
  const brand = Symbol.for(key);
  Object.defineProperty(type.prototype, brand, { value: true });
  Object.defineProperty(type, Symbol.hasInstance, {
    value(this: unknown, value: unknown): boolean {
      if (Function.prototype[Symbol.hasInstance].call(this, value)) return true;
      return (
        this === type &&
        value !== null &&
        typeof value === "object" &&
        (value as Record<symbol, unknown>)[brand] === true
      );
    },
  });
}

/**
 * Returns process-wide state shared by every copy of this package.
 * @param name - State slot name ending in its shape version (`failure-details@1`); bump the version
 *   when the stored shape changes, so copies only share a slot whose shape they agree on.
 * @param create - Initializer used by the first copy that asks.
 * @returns The one shared value for this slot.
 * @example const store = sharedAcrossCopies("failure-details@1", () => ({ details: new WeakMap() }));
 */
export function sharedAcrossCopies<T extends object>(name: string, create: () => T): T {
  const registry = ((globalThis as Record<symbol, unknown>)[SHARED_STATE] ??= new Map()) as Map<
    string,
    object
  >;
  let value = registry.get(name);
  if (value === undefined) {
    value = create();
    registry.set(name, value);
  }
  return value as T;
}
