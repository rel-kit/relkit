import type { TestFakeRoot } from "./fake-utils.types.js";
export type { TestFakeRoot } from "./fake-utils.types.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createTestStateRoot } from "./state-root.js";
import type { TestFailureControls } from "./fakes.js";

/**
 * Acquires a category-specific persistence path beneath an owned state root.
 * @param requestedPath - Explicit caller-owned restart root or absent temporary-root request.
 * @param category - Native fake resource category beneath the root.
 * @param id - Declared resource or tool identity.
 * @returns Its path and cleanup hook; partial setup releases temporary ownership.
 */
export function createFakeRoot(
  requestedPath: string | undefined,
  category: string,
  id: string,
): TestFakeRoot {
  const owner = createTestStateRoot(requestedPath);
  const stateRoot = join(owner.path, category, encodeURIComponent(id));
  try {
    mkdirSync(stateRoot, { recursive: true });
  } catch (error) {
    owner.cleanup(true);
    throw error;
  }
  return { stateRoot, cleanup: owner.cleanup };
}

/**
 * Validates and trims a required fake storage identity.
 * @param value - Candidate native value checked or detached by this helper.
 * @param name - Declared field or policy name used by existing validation errors.
 * @returns The non-empty trimmed value.
 */
export function text(value: string, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

/**
 * Validates the existing optional positive TTL policy.
 * @param value - Candidate native value checked or detached by this helper.
 * @param name - Declared field or policy name used by existing validation errors.
 * @returns The safe positive integer or undefined.
 */
export function positive(value: number | undefined, name: string): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError(`Cache ${name} must be a positive integer`);
  }
  return value;
}

/**
 * Detaches native fixture data using structured cloning.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns An independent copy, preserving native structuredClone failures.
 */
export function clone(value: unknown): unknown {
  return structuredClone(value);
}

export const noFailures: TestFailureControls = Object.freeze({
  failAt: () => undefined,
  once: () => undefined,
  clear: () => undefined,
  check: () => undefined,
});

/**
 * Validates the existing dependency-fake failure boundary name.
 * @param point Native failure injection boundary.
 * @returns Nothing for a non-empty boundary name.
 */
export function assertFailurePoint(point: string): void {
  if (point.length === 0) throw new TypeError("Failure point must not be empty");
}

/**
 * Creates owner-local dependency instances only on first named access.
 * @typeParam T - Native dependency client or owned storage instance retained by identity.
 * @param records - Owner-local instances retained by dependency identity.
 * @param create - Synchronous first-access constructor for one named dependency.
 * @returns A record proxy retaining each created dependency by identity.
 */
export function lazyRecords<T>(
  records: Record<string, T>,
  create: (id: string) => T,
): Record<string, T> {
  return new Proxy(records, {
    get(target, property, receiver) {
      if (typeof property !== "string") return Reflect.get(target, property, receiver);
      if (target[property] !== undefined) return target[property];
      const created = create(property);
      return (target[property] ??= created);
    },
  });
}

/**
 * Rejects empty dependency client names.
 * @param name - Declared field or policy name used by existing validation errors.
 * @returns Nothing for a named dependency.
 */
export function assertName(name: string): void {
  if (name.length === 0) throw new TypeError("Fake client name must not be empty");
}
