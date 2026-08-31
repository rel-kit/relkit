import { deepFreeze, isDescriptor, isRef } from "@relkit/contracts";
import type { FunctionRefAny } from "@relkit/functions";
import type { ServiceDescriptorAny, ServiceRefAny } from "./types.js";

export const SERVICE_RESERVED_MEMBER_NAMES = Object.freeze([
  "kind",
  "id",
  "ref",
  "functions",
  "events",
  "capability",
  "title",
  "description",
  "tags",
  "handler",
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
  if (name !== value)
    throw new TypeError(`Service member name "${String(value)}" is not normalized`);
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

export function isServiceDescriptor(value: unknown): value is ServiceDescriptorAny {
  if (!isRecord(value) || !isDescriptor(value, "service") || hasOwn(value, "handler")) return false;
  for (const [name, member] of serviceMemberEntries(value)) {
    if (isReservedServiceMemberName(name)) continue;
    if (!isFunctionDescriptor(member) && !isEventDescriptor(member)) return false;
  }
  return true;
}

export function assertServiceDescriptor(value: unknown): asserts value is ServiceDescriptorAny {
  if (!isServiceDescriptor(value)) throw new TypeError("Invalid service descriptor");
}

export function freezeServiceDescriptor<T extends ServiceDescriptorAny>(value: T): T {
  assertServiceDescriptor(value);
  return deepFreeze(value);
}

export function serviceMemberEntries(service: ServiceDescriptorAny): [string, unknown][] {
  return Object.entries(service).filter(([name]) => !isReservedServiceMemberName(name));
}

export function isFunctionDescriptor(value: unknown): value is FunctionRefAny {
  if (!isRecord(value) || !isDescriptor(value, "function")) return false;
  const descriptor = value as DescriptorRecord;
  return (
    descriptor.invocationMode !== "event-only" &&
    isSchema(descriptor.input) &&
    isSchema(descriptor.output) &&
    typeof descriptor.handler === "function"
  );
}

function isEventDescriptor(value: unknown): boolean {
  return isRecord(value) && isDescriptor(value, "event");
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

type DescriptorRecord = Record<PropertyKey, any>;
