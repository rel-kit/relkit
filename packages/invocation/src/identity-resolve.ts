import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { assertIdentityObject, DescriptorIdentityError, identityOperation, runIdentitySync } from "./identity-state.js";
import type {
  DescriptorIdentitySource,
  IdentityStoreService,
  ResolvedDescriptorIdentity,
} from "./identity-resolve.types.js";

export const UNBOUND_DESCRIPTOR_ID_PREFIX = "unbound.";

/** Creates a noncanonical process-local diagnostic identity.
 * @returns An unbound ID; random generation can be substituted with `IdentityStore`.
 * @example Effect.runSync(createUnboundIdentityEffect());
 */
export function createUnboundIdentityEffect() {
  return identityOperation("identity.create", (store) =>
    `${UNBOUND_DESCRIPTOR_ID_PREFIX}${store.nextUnboundId()}`);
}

/** Synchronous unbound ID adapter.
 * @returns A process-local diagnostic ID.
 * @throws An unexpected defect if the random source fails.
 * @example createUnboundIdentity();
 */
export function createUnboundIdentity(): string {
  return runIdentitySync(createUnboundIdentityEffect());
}

/** Resolves canonical or process-local identity without mutating the descriptor.
 * @param descriptor - Descriptor object.
 * @returns Its immutable identity or a tagged identity failure.
 * @example Effect.runSync(resolveDescriptorIdentityEffect(descriptor));
 */
export function resolveDescriptorIdentityEffect(descriptor: object & DescriptorIdentitySource) {
  return identityOperation("identity.resolve", (store) => resolveWithStore(descriptor, store));
}

/** Synchronous descriptor identity adapter.
 * @param descriptor - Descriptor object.
 * @returns Its immutable identity.
 * @throws DescriptorIdentityError for invalid declared IDs.
 * @example resolveDescriptorIdentity(descriptor);
 */
export function resolveDescriptorIdentity(
  descriptor: object & DescriptorIdentitySource,
): ResolvedDescriptorIdentity {
  return runIdentitySync(resolveDescriptorIdentityEffect(descriptor));
}

/** Reads a descriptor's resolved ID.
 * @param descriptor - Descriptor object.
 * @returns Its stable or process-local ID, or a tagged failure.
 * @example Effect.runSync(getDescriptorIdentityEffect(descriptor));
 */
export function getDescriptorIdentityEffect(descriptor: object & DescriptorIdentitySource) {
  return identityOperation("identity.get", (store) => resolveWithStore(descriptor, store).id);
}

/** Synchronous resolved ID adapter.
 * @param descriptor - Descriptor object.
 * @returns Its stable or process-local ID.
 * @throws DescriptorIdentityError for invalid declared IDs.
 * @example getDescriptorIdentity(descriptor);
 */
export function getDescriptorIdentity(descriptor: object & DescriptorIdentitySource): string {
  return runIdentitySync(getDescriptorIdentityEffect(descriptor));
}

/** Resolves the identity of a descriptor's owning service, if any.
 * @param descriptor - Service member.
 * @returns Owning service ID or undefined, or a tagged identity failure.
 * @example Effect.runSync(getDescriptorServiceIdentityEffect(member));
 */
export function getDescriptorServiceIdentityEffect(descriptor: object) {
  return identityOperation("identity.service-get", (store) => {
    assertIdentityObject(descriptor);
    const service = store.services.get(descriptor);
    return service === undefined ? undefined : resolveWithStore(service, store).id;
  });
}

/** Synchronous owning service identity adapter.
 * @param descriptor - Service member.
 * @returns Owning service ID or undefined.
 * @throws DescriptorIdentityError for invalid service IDs.
 * @example getDescriptorServiceIdentity(member);
 */
export function getDescriptorServiceIdentity(descriptor: object): string | undefined {
  return runIdentitySync(getDescriptorServiceIdentityEffect(descriptor));
}

/** Checks whether a value carries the unbound ID prefix.
 * @param value - Candidate value.
 * @returns True for a process-local diagnostic ID; no expected failure.
 * @example Effect.runSync(isUnboundIdentityEffect("unbound.123"));
 */
export function isUnboundIdentityEffect(value: unknown): Effect.Effect<boolean> {
  return observeInvocation("identity.is-unbound", Effect.sync(() => isUnboundIdentityValue(value)));
}

/** Synchronous unbound ID predicate adapter.
 * @param value - Candidate value.
 * @returns True for an unbound diagnostic ID.
 * @example isUnboundIdentity("unbound.123");
 */
export function isUnboundIdentity(value: unknown): value is string {
  return runInvocationSync(isUnboundIdentityEffect(value));
}

/** Reads a declared stable ID inside an observed identity operation.
 * @param descriptor - Descriptor to inspect.
 * @returns Its declared ID or undefined.
 * @throws DescriptorIdentityError for a malformed declared ID.
 * @example readDeclaredId({ id: "orders.find" });
 */
export function readDeclaredId(descriptor: object & DescriptorIdentitySource): string | undefined {
  const id = descriptor.id;
  if (id === undefined) return undefined;
  if (typeof id !== "string" || !isStableId(id))
    throw new DescriptorIdentityError("Descriptor identity must be a canonical stable ID");
  return id;
}

/** Checks an unbound prefix inside an observed identity operation.
 * @param value - Candidate ID.
 * @returns True for a process-local diagnostic ID.
 * @example isUnboundIdentityValue("unbound.1");
 */
export function isUnboundIdentityValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(UNBOUND_DESCRIPTOR_ID_PREFIX);
}

function resolveWithStore(
  descriptor: object & DescriptorIdentitySource,
  store: IdentityStoreService,
): ResolvedDescriptorIdentity {
  assertIdentityObject(descriptor);
  const bound = store.canonical.get(descriptor);
  if (bound !== undefined) return Object.freeze({ id: bound, canonical: true, key: bound });
  const declared = readDeclaredId(descriptor);
  if (declared !== undefined && !isUnboundIdentityValue(declared))
    return Object.freeze({ id: declared, canonical: true, key: declared });
  const id = store.unbound.get(descriptor) ?? declared
    ?? `${UNBOUND_DESCRIPTOR_ID_PREFIX}${store.nextUnboundId()}`;
  store.unbound.set(descriptor, id);
  return Object.freeze({ id, canonical: false, key: descriptor });
}
