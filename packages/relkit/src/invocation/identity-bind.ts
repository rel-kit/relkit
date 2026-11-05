import { normalizeId } from "../contracts/index.js";
import { Effect } from "effect";
import {
  assertIdentityObject,
  DescriptorIdentityError,
  identityOperation,
  runIdentitySync,
} from "./identity-state.js";
import { isUnboundIdentityValue, readDeclaredId } from "./identity-resolve.js";
import type { DescriptorIdentitySource } from "./identity-bind.types.js";

/** Binds a canonical descriptor identity without mutating the descriptor.
 * @param descriptor - Descriptor object.
 * @param id - Canonical stable ID.
 * @returns The original descriptor or a tagged identity failure.
 * @example Effect.runSync(bindDescriptorIdentityEffect(descriptor, "tasks.run"));
 */
export function bindDescriptorIdentityEffect<T extends object>(
  descriptor: T,
  id: string,
): Effect.Effect<T, import("./identity-state.js").DescriptorIdentityFailure> {
  return identityOperation("identity.bind", (store) => {
    assertIdentityObject(descriptor);
    const canonical = normalizeId(id);
    const existing = store.canonical.get(descriptor);
    if (existing !== undefined && existing !== canonical)
      throw new DescriptorIdentityError(
        `Descriptor identity is already bound to ${JSON.stringify(existing)}`,
      );
    const declared = readDeclaredId(descriptor);
    if (declared !== undefined && !isUnboundIdentityValue(declared) && declared !== canonical)
      throw new DescriptorIdentityError(
        `Descriptor identity ${JSON.stringify(declared)} does not match ${JSON.stringify(canonical)}`,
      );
    store.canonical.set(descriptor, canonical);
    return descriptor;
  });
}

/** Synchronous canonical identity binding adapter.
 * @param descriptor - Descriptor object.
 * @param id - Canonical stable ID.
 * @returns The original descriptor.
 * @throws DescriptorIdentityError or TypeError for invalid identity.
 * @example bindDescriptorIdentity(descriptor, "tasks.run");
 */
export function bindDescriptorIdentity<T extends object>(descriptor: T, id: string): T {
  return runIdentitySync(bindDescriptorIdentityEffect(descriptor, id));
}

/** Checks if a descriptor has an explicit canonical binding.
 * @param descriptor - Descriptor object.
 * @returns True when bound; no expected failure.
 * @example Effect.runSync(isDescriptorIdentityBoundEffect(descriptor));
 */
export function isDescriptorIdentityBoundEffect(descriptor: object) {
  return identityOperation("identity.is-bound", (store) => store.canonical.has(descriptor));
}

/** Synchronous bound check adapter.
 * @param descriptor - Descriptor object.
 * @returns True when bound.
 * @example isDescriptorIdentityBound(descriptor);
 */
export function isDescriptorIdentityBound(descriptor: object): boolean {
  return runIdentitySync(isDescriptorIdentityBoundEffect(descriptor));
}

/** Associates descriptor members with one service without changing them.
 * @param descriptors - Service members.
 * @param service - Owning service.
 * @returns The original array or a tagged identity failure.
 * @example Effect.runSync(bindDescriptorServiceMembersEffect([member], service));
 */
export function bindDescriptorServiceMembersEffect<T extends object>(
  descriptors: readonly T[],
  service: object & DescriptorIdentitySource,
) {
  return identityOperation("identity.service-bind", (store) => {
    assertIdentityObject(service);
    const epoch = currentEvaluationEpoch();
    for (const descriptor of descriptors) {
      assertIdentityObject(descriptor);
      const existing = store.services.get(descriptor);
      // A service from an earlier development evaluation pass was replaced by this one.
      const superseded = existing !== undefined && (ownerEpochs.get(existing) ?? 0) < epoch;
      if (existing !== undefined && existing !== service && !superseded)
        throw new DescriptorIdentityError("Descriptor already belongs to another service");
    }
    ownerEpochs.set(service, epoch);
    for (const descriptor of descriptors) store.services.set(descriptor, service);
    return descriptors;
  });
}

/** Evaluation pass in which each service was defined; see {@link currentEvaluationEpoch}. */
const ownerEpochs = new WeakMap<object, number>();

/**
 * Reads the development evaluation epoch. `relkit dev` advances it each time it evicts
 * changed modules, so a service module evaluated again may claim the unchanged functions
 * its previous instance owned. It is shared through `globalThis` because the evaluator and
 * the application can load separate copies of `relkit`; it stays 0 outside development.
 * @returns The current epoch.
 */
function currentEvaluationEpoch(): number {
  const value = (globalThis as { readonly [key: symbol]: number | undefined })[
    Symbol.for("relkit.dev.evaluationEpoch")
  ];
  return typeof value === "number" ? value : 0;
}

/** Synchronous service member binding adapter.
 * @param descriptors - Service members.
 * @param service - Owning service.
 * @returns The original array.
 * @throws DescriptorIdentityError when a member belongs to another service.
 * @example bindDescriptorServiceMembers([member], service);
 */
export function bindDescriptorServiceMembers<T extends object>(
  descriptors: readonly T[],
  service: object & DescriptorIdentitySource,
): readonly T[] {
  return runIdentitySync(bindDescriptorServiceMembersEffect(descriptors, service));
}
