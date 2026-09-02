import { isStableId, normalizeId } from "@relkit/contracts";

export const UNBOUND_DESCRIPTOR_ID_PREFIX = "unbound.";

export interface DescriptorIdentitySource {
  readonly id?: unknown;
}

export interface ResolvedDescriptorIdentity {
  readonly id: string;
  readonly canonical: boolean;
  readonly key: object | string;
}

export class DescriptorIdentityError extends TypeError {
  readonly code = "RELKIT_DESCRIPTOR_IDENTITY_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "DescriptorIdentityError";
  }
}

const canonicalIdentities = new WeakMap<object, string>();
const unboundIdentities = new WeakMap<object, string>();
const descriptorServices = new WeakMap<object, object & DescriptorIdentitySource>();

/** Creates a process-local diagnostic identity that is not a canonical address. */
export function createUnboundIdentity(): string {
  return `${UNBOUND_DESCRIPTOR_ID_PREFIX}${crypto.randomUUID()}`;
}

/** Binds a canonical identity without mutating or cloning the executable descriptor. */
export function bindDescriptorIdentity<T extends object>(descriptor: T, id: string): T {
  assertObject(descriptor);
  const canonical = normalizeId(id);
  const existing = canonicalIdentities.get(descriptor);
  if (existing !== undefined && existing !== canonical) {
    throw new DescriptorIdentityError(
      `Descriptor identity is already bound to ${JSON.stringify(existing)}`,
    );
  }
  const declared = readDeclaredId(descriptor);
  if (declared !== undefined && !isUnboundIdentity(declared) && declared !== canonical) {
    throw new DescriptorIdentityError(
      `Descriptor identity ${JSON.stringify(declared)} does not match ${JSON.stringify(canonical)}`,
    );
  }
  canonicalIdentities.set(descriptor, canonical);
  return descriptor;
}

export function isDescriptorIdentityBound(descriptor: object): boolean {
  return canonicalIdentities.has(descriptor);
}

/** Associates identity-preserving members with one service without mutating them. */
export function bindDescriptorServiceMembers<T extends object>(
  descriptors: readonly T[],
  service: object & DescriptorIdentitySource,
): readonly T[] {
  assertObject(service);
  for (const descriptor of descriptors) {
    assertObject(descriptor);
    const existing = descriptorServices.get(descriptor);
    if (existing !== undefined && existing !== service) {
      throw new DescriptorIdentityError("Descriptor already belongs to another service");
    }
  }
  for (const descriptor of descriptors) descriptorServices.set(descriptor, service);
  return descriptors;
}

export function getDescriptorServiceIdentity(descriptor: object): string | undefined {
  assertObject(descriptor);
  const service = descriptorServices.get(descriptor);
  return service === undefined ? undefined : getDescriptorIdentity(service);
}

export function resolveDescriptorIdentity(
  descriptor: object & DescriptorIdentitySource,
): ResolvedDescriptorIdentity {
  assertObject(descriptor);
  const bound = canonicalIdentities.get(descriptor);
  if (bound !== undefined) return Object.freeze({ id: bound, canonical: true, key: bound });

  const declared = readDeclaredId(descriptor);
  if (declared !== undefined && !isUnboundIdentity(declared)) {
    return Object.freeze({ id: declared, canonical: true, key: declared });
  }

  const id = unboundIdentities.get(descriptor) ?? declared ?? createUnboundIdentity();
  unboundIdentities.set(descriptor, id);
  return Object.freeze({ id, canonical: false, key: descriptor });
}

export function getDescriptorIdentity(descriptor: object & DescriptorIdentitySource): string {
  return resolveDescriptorIdentity(descriptor).id;
}

export function isUnboundIdentity(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(UNBOUND_DESCRIPTOR_ID_PREFIX);
}

function readDeclaredId(descriptor: object & DescriptorIdentitySource): string | undefined {
  const id = descriptor.id;
  if (id === undefined) return undefined;
  if (typeof id !== "string" || !isStableId(id)) {
    throw new DescriptorIdentityError("Descriptor identity must be a canonical stable ID");
  }
  return id;
}

function assertObject(value: object): void {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    throw new TypeError("Descriptor identity requires an object");
  }
}
