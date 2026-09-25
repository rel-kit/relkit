/** Descriptor with an optional declared stable ID.
 * An absent ID receives a process-local unbound identity.
 * @example const descriptor: DescriptorIdentitySource = { id: "tasks.run" };
 */
export interface DescriptorIdentitySource {
  readonly id?: unknown;
}

/** Canonical or process-local resolved descriptor identity.
 * A noncanonical ID is valid only for this process lifetime.
 * @example const identity = resolveDescriptorIdentity(descriptor);
 */
export interface ResolvedDescriptorIdentity {
  readonly id: string;
  readonly canonical: boolean;
  readonly key: object | string;
}

/** Mutable identity registries and ID generation, isolated per Layer in tests.
 * A live store preserves object bindings across operations in one process.
 * @example const layer = Layer.succeed(IdentityStore, store);
 */
export interface IdentityStoreService {
  readonly canonical: WeakMap<object, string>;
  readonly unbound: WeakMap<object, string>;
  readonly services: WeakMap<object, object & DescriptorIdentitySource>;
  /** Generates a process-local identity for an unbound descriptor.
   * @returns A unique unbound ID.
   * @example store.nextUnboundId();
   */
  readonly nextUnboundId: () => string;
}
