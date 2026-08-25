import { isDescriptor, isRef, isStableId, deepFreeze } from "@zsys/contracts";
import type { FunctionRefAny } from "@zsys/functions";
import type {
  ServiceDescriptorAny,
  ServiceMiddlewareDescriptor,
  ServiceMiddlewareRefAny,
  ServiceRefAny,
} from "./types.js";

export const SERVICE_RESERVED_MEMBER_NAMES = Object.freeze([
  "kind",
  "id",
  "ref",
  "functions",
  "middleware",
  "service",
  "title",
  "description",
  "tags",
  "invoke",
  "asTool",
  "handler",
  "target",
  "constructor",
  "prototype",
  "__proto__",
] as const);

export const RESERVED_SERVICE_MEMBER_NAMES = SERVICE_RESERVED_MEMBER_NAMES;

export function normalizeServiceMemberName(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Service member names must be strings");
  const name = value.normalize("NFC").trim();
  if (name === "") throw new TypeError("Service member names must be non-empty");
  return name;
}

export function isReservedServiceMemberName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SERVICE_RESERVED_MEMBER_NAMES.includes(
    value.normalize("NFC").trim() as (typeof SERVICE_RESERVED_MEMBER_NAMES)[number],
  );
}

export function assertServiceMemberName(value: unknown): asserts value is string {
  const name = normalizeServiceMemberName(value);
  if (isReservedServiceMemberName(name)) {
    throw new TypeError(`Service member name "${name}" is reserved`);
  }
}

export function isServiceRef(value: unknown): value is ServiceRefAny {
  return isRecord(value) && isRef(value.ref, "service");
}

export function assertServiceRef(value: unknown): asserts value is ServiceRefAny {
  if (!isServiceRef(value)) throw new TypeError("Invalid service reference");
}

export function isServiceMiddlewareRef(value: unknown): value is ServiceMiddlewareRefAny {
  if (!isRecord(value) || !isRecord(value.ref)) return false;
  return (
    Reflect.ownKeys(value.ref).length === 2 &&
    value.ref.kind === "service-middleware" &&
    isStableId(value.ref.id)
  );
}

export function assertServiceMiddlewareRef(
  value: unknown,
): asserts value is ServiceMiddlewareRefAny {
  if (!isServiceMiddlewareRef(value)) throw new TypeError("Invalid service middleware reference");
}

export function isServiceMiddlewareDescriptor(
  value: unknown,
): value is ServiceMiddlewareDescriptor {
  if (!isServiceMiddlewareRef(value) || !isRecord(value)) return false;
  const descriptor = value as ServiceMiddlewareRefAny & Record<PropertyKey, unknown>;
  return (
    descriptor.kind === "service-middleware" &&
    descriptor.id === descriptor.ref.id &&
    typeof descriptor.handler === "function"
  );
}

export function assertServiceMiddlewareDescriptor(
  value: unknown,
): asserts value is ServiceMiddlewareDescriptor {
  if (!isServiceMiddlewareDescriptor(value)) {
    throw new TypeError("Invalid service middleware descriptor");
  }
}

export function isServiceDescriptor(value: unknown): value is ServiceDescriptorAny {
  if (!isRecord(value) || !isDescriptor(value, "service") || hasOwn(value, "handler")) {
    return false;
  }
  const descriptor = value as ServiceDescriptorAny;
  const functions = descriptor.functions;
  if (!isRecord(functions) || Object.keys(functions).length === 0) return false;
  const names = new Set<string>();
  for (const [rawName, target] of Object.entries(functions)) {
    let name: string;
    try {
      name = normalizeServiceMemberName(rawName);
    } catch {
      return false;
    }
    if (names.has(name) || isReservedServiceMemberName(name) || !isFunctionDescriptor(target)) {
      return false;
    }
    names.add(name);
  }
  return (
    descriptor.middleware === undefined ||
    (Array.isArray(descriptor.middleware) && descriptor.middleware.every(isServiceMiddlewareEntry))
  );
}

export function assertServiceDescriptor(value: unknown): asserts value is ServiceDescriptorAny {
  if (!isServiceDescriptor(value)) throw new TypeError("Invalid service descriptor");
}

export function freezeServiceDescriptor<T extends ServiceDescriptorAny>(value: T): T {
  assertServiceDescriptor(value);
  return deepFreeze(value);
}

function isFunctionDescriptor(value: unknown): value is FunctionRefAny {
  if (!isRecord(value) || !isDescriptor(value, "function")) return false;
  const descriptor = value as unknown as FunctionRefAny & Record<string, unknown>;
  return (
    isSchema(descriptor.input) &&
    isSchema(descriptor.output) &&
    typeof descriptor.handler === "function" &&
    typeof descriptor.invoke === "function"
  );
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function isServiceMiddlewareEntry(value: unknown): boolean {
  if (!isServiceMiddlewareRef(value) || !isRecord(value)) return false;
  if ("kind" in value || "id" in value || "handler" in value) {
    return isServiceMiddlewareDescriptor(value);
  }
  return true;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
