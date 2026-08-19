import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createTestStateRoot } from "./state-root.js";
import type { TestFailureControls } from "./fakes.js";

export interface TestFakeRoot {
  readonly stateRoot: string;
  readonly cleanup: (failed: boolean) => void;
}

export function createFakeRoot(
  requestedPath: string | undefined,
  category: string,
  id: string,
): TestFakeRoot {
  const owner = createTestStateRoot(requestedPath);
  const stateRoot = join(owner.path, category, encodeURIComponent(id));
  mkdirSync(stateRoot, { recursive: true });
  return { stateRoot, cleanup: owner.cleanup };
}

export function text(value: string, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

export function positive(value: number | undefined, name: string): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new RangeError(`Cache ${name} must be a positive integer`);
  }
  return value;
}

export function clone(value: unknown): unknown {
  return structuredClone(value);
}

export const noFailures: TestFailureControls = Object.freeze({
  failAt: () => undefined,
  once: () => undefined,
  clear: () => undefined,
  check: () => undefined,
});
