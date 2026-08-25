import { deepFreeze, isRef } from "@zsys/contracts";
import { resolveDescriptorIdentity } from "@zsys/invocation";
import {
  isErrorDescriptor,
  type FunctionRefAny,
  type FunctionToolApproval,
  type FunctionToolSideEffect,
  type FunctionToolTarget,
} from "@zsys/functions";

export function copyFunctionTarget<Target extends FunctionRefAny>(
  target: Target,
): FunctionToolTarget<Target> {
  if (!isFunctionTarget(target)) throw new TypeError("Tool target must be a function reference");
  const identity = resolveDescriptorIdentity(target);
  return deepFreeze({
    ref: Object.freeze({
      kind: "function" as const,
      id: identity.canonical ? identity.id : target.ref.id,
    }),
    input: target.input,
    output: target.output,
    ...(target.errors === undefined ? {} : { errors: Object.freeze([...target.errors]) }),
  }) as FunctionToolTarget<Target>;
}

export function validateSideEffect(value: unknown): FunctionToolSideEffect {
  if (!isToolSideEffect(value)) {
    throw new TypeError("Tool sideEffect must be none, read, write, or external");
  }
  return value;
}

export function validateApproval(value: unknown): FunctionToolApproval {
  if (!isToolApproval(value)) {
    throw new TypeError("Tool approval must be never, on-write, or always");
  }
  return value;
}

export function isToolSideEffect(value: unknown): value is FunctionToolSideEffect {
  return value === "none" || value === "read" || value === "write" || value === "external";
}

export function isToolApproval(value: unknown): value is FunctionToolApproval {
  return value === "never" || value === "on-write" || value === "always";
}

export function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

export function positiveInteger(value: unknown, name: string): asserts value is number {
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a positive integer`);
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output) &&
    (!hasOwn(value, "handler") || typeof value.handler === "function") &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor)))
  );
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
