import type { FunctionRefAny } from "@zsys/functions";

const serviceOwners = new WeakMap<object, string>();

export function assertServiceFunctionOwnership(
  functions: Readonly<Record<string, FunctionRefAny>>,
  serviceId: string,
): void {
  for (const target of Object.values(functions)) {
    const owner = serviceOwners.get(target);
    const declaredOwner = readDeclaredOwner(target);
    const existing = owner ?? declaredOwner;
    if (existing !== undefined && existing !== serviceId) {
      throw new TypeError(`Function "${target.ref.id}" already belongs to service "${existing}"`);
    }
  }
}

export function claimServiceFunctionOwnership(
  functions: Readonly<Record<string, FunctionRefAny>>,
  serviceId: string,
): void {
  for (const target of Object.values(functions)) serviceOwners.set(target, serviceId);
}

function readDeclaredOwner(target: FunctionRefAny): string | undefined {
  const candidate = target as FunctionRefAny & Record<PropertyKey, any>;
  if (!isRecord(candidate) || !isRecord(candidate.service) || !isRecord(candidate.service.ref)) {
    return undefined;
  }
  return typeof candidate.service.ref.id === "string" ? candidate.service.ref.id : undefined;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object";
}
