import { isRef, isStableId } from "@relkit/contracts";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionRefAny } from "./types.js";
import type { FunctionToolApproval, FunctionToolSideEffect } from "./function-tool.js";
import type { FunctionToolOptions } from "./function-tool.js";

export function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output) &&
    (!hasOwn(value, "handler") || typeof value.handler === "function") &&
    (!hasOwn(value, "invoke") || typeof value.invoke === "function") &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor)))
  );
}

export function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  if (!isRecord(value) || value.kind !== "error" || !isStableId(value.id)) return false;
  const ref = value.ref;
  return (
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id &&
    typeof value.create === "function"
  );
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

export function validateSideEffect(value: unknown): FunctionToolSideEffect {
  if (value !== "none" && value !== "read" && value !== "write" && value !== "external") {
    throw new TypeError("Tool sideEffect must be none, read, write, or external");
  }
  return value;
}

export function validateApproval(value: unknown): FunctionToolApproval {
  if (value !== "never" && value !== "on-write" && value !== "always") {
    throw new TypeError("Tool approval must be never, on-write, or always");
  }
  return value;
}

export function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

export function positiveInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

export function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    !Array.isArray(value)
  );
}

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function copyFunctionToolHooks(
  value: unknown,
): Pick<FunctionToolOptions, "onBefore" | "onAfter"> {
  if (!isRecord(value)) throw new TypeError("Function tool options must be an object");
  if (value.onBefore !== undefined && typeof value.onBefore !== "function") {
    throw new TypeError("Tool onBefore must be a function");
  }
  if (value.onAfter !== undefined && typeof value.onAfter !== "function") {
    throw new TypeError("Tool onAfter must be a function");
  }
  return {
    ...(value.onBefore === undefined ? {} : { onBefore: value.onBefore }),
    ...(value.onAfter === undefined ? {} : { onAfter: value.onAfter }),
  };
}
