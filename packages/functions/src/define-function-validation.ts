import { isRef, type DescriptorKind } from "@relkit/contracts";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { FunctionDependencies, FunctionRefAny } from "./types.js";

export function copyDependencies<D extends FunctionDependencies>(
  dependencies: D | undefined,
): D | undefined {
  if (dependencies === undefined) return undefined;
  if (Object.hasOwn(dependencies, "functions")) {
    throw new TypeError("Function dependencies are not supported; use descriptor.invoke");
  }
  if (Object.hasOwn(dependencies, "events")) {
    throw new TypeError("Event dependencies are not supported; declare publishes instead");
  }
  const result: Record<string, unknown> = {};
  const kinds: Readonly<Record<string, DescriptorKind>> = {
    jobs: "job",
    buckets: "bucket",
    cache: "cache",
    agents: "agent",
  };
  for (const [name, kind] of Object.entries(kinds)) {
    const map = dependencies[name as keyof FunctionDependencies];
    if (map === undefined) continue;
    if (!isRecord(map)) throw new TypeError(`Function dependency map "${name}" must be an object`);
    const copied: Record<string, unknown> = {};
    for (const [client, target] of Object.entries(map)) {
      if (!isRecord(target) || !isRef(target.ref, kind)) {
        throw new TypeError(`Invalid ${name} dependency "${client}"`);
      }
      copied[client] = target;
    }
    result[name] = Object.freeze(copied);
  }
  return Object.freeze(result) as D;
}

export function copyPublishes<Names extends readonly string[]>(
  publishes: Names | undefined,
): Names | undefined {
  if (publishes === undefined) return undefined;
  if (!Array.isArray(publishes)) throw new TypeError("Function publishes must be an array");
  const values = publishes.map((eventId) => {
    if (typeof eventId !== "string" || eventId.trim() === "") {
      throw new TypeError("Function publishes entries must be non-empty event IDs");
    }
    return eventId.trim();
  });
  if (new Set(values).size !== values.length) {
    throw new TypeError("Function publishes entries must be unique");
  }
  return Object.freeze(values) as unknown as Names;
}

export function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

export function assertHook(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`Function ${name} must be a function`);
  }
}

export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isRecord(value)) throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  const standard = value["~standard"];
  if (!isRecord(standard) || standard.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  }
}

export function functionTargetForReceiver(
  receiver: unknown,
  fallback: FunctionRefAny,
): FunctionRefAny {
  if (isRecord(receiver) && receiver.invocationMode === "event-only") {
    throw new TypeError("Event-only functions cannot be invoked or converted to tools");
  }
  if (
    isRecord(receiver) &&
    isRef(receiver.ref, "function") &&
    typeof receiver.handler === "function"
  ) {
    return receiver as unknown as FunctionRefAny;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
