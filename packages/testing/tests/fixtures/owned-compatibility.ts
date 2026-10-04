import { afterEach } from "bun:test";
import { mkdtempSync as nativeMkdtemp, rmSync } from "node:fs";
import { createJobsRuntime as nativeJobsRuntime } from "@relkit/jobs";
import {
  createTestAgent as nativeAgent,
  createTestModel as nativeModel,
} from "../../src/agents.ts";
import { createTestRuntime as nativeRuntime } from "../../src/runtime.ts";
import { createTestFakes as nativeFakes } from "../../src/fakes.ts";
import { createTestCacheFake as nativeCache } from "../../src/cache.ts";
import { createDeterministicJobsAdapter as nativeAdapter } from "../../src/test-jobs-adapter.ts";
import { activateTestProviders as nativeProviders } from "../../src/provider-replacements.ts";
import type { CompatibilityRelease } from "./owned-compatibility.types.js";

const owners: CompatibilityRelease[] = [];
/** @returns Completion after every acquired owner releases in reverse acquisition order. */
export async function closeCompatibilityOwners(): Promise<void> {
  const owned = owners.splice(0).reverse();
  const failures: unknown[] = [];
  for (const owner of owned) {
    try {
      await owner.release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0)
    throw new AggregateError(failures, "Compatibility fixture cleanup failed");
}
afterEach(closeCompatibilityOwners);

/**
 * Registers a native owner while preserving its original identity and methods.
 * @param value Native result returned by the unchanged public fixture factory.
 * @returns The same native value; factories with no owner are passed through.
 */
function retain(value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    if ("close" in value && typeof value.close === "function") {
      const close = value.close;
      owners.push({ release: () => close.call(value) });
    } else if ("release" in value && typeof value.release === "function") {
      const release = value.release;
      owners.push({ release: () => release.call(value) });
    }
  }
  return value;
}

/**
 * Preserves the native generic factory signature and registers each acquired owner.
 * @typeParam Factory Original public callable type; inference is unchanged by the Proxy.
 * @param factory Native factory executed in Bun with unchanged arguments and receiver.
 * @returns The same typed factory boundary with immediate successful-acquisition tracking.
 * @remarks This fixture changes only ownership bookkeeping, never assertions or runner APIs.
 */
function ownedFactory<Factory extends object>(factory: Factory): Factory {
  return new Proxy(factory, {
    apply(target, receiver, arguments_) {
      if (typeof target !== "function") throw new TypeError("Expected a native fixture factory");
      const result: unknown = Reflect.apply(target, receiver, arguments_);
      return result instanceof Promise ? result.then(retain) : retain(result);
    },
  });
}

/** Native runtime fixture with failure-safe test-owned shutdown. */
export const createTestRuntime = ownedFactory(nativeRuntime);
/** Native agent fixture with failure-safe test-owned shutdown. */
export const createTestAgent = ownedFactory(nativeAgent);
/** Native model fixture with failure-safe test-owned shutdown. */
export const createTestModel = ownedFactory(nativeModel);
/** Native fake-provider fixture with failure-safe test-owned shutdown. */
export const createTestFakes = ownedFactory(nativeFakes);
/** Native writable-cache fixture with failure-safe test-owned shutdown. */
export const createTestCacheFake = ownedFactory(nativeCache);
/** Native jobs adapter fixture with failure-safe test-owned shutdown. */
export const createDeterministicJobsAdapter = ownedFactory(nativeAdapter);
/** Production jobs runtime fixture with failure-safe test-owned shutdown. */
export const createJobsRuntime = ownedFactory(nativeJobsRuntime);
/** Native replacement registry fixture with failure-safe test-owned release. */
export const activateTestProviders = ownedFactory(nativeProviders);

/**
 * Registers temporary directory cleanup before any later fixture acquisition.
 * @param prefix Native temporary-directory prefix passed unchanged to mkdtempSync.
 * @returns The created native path, removed after all subsequently acquired owners release.
 */
export const mkdtempSync = new Proxy(nativeMkdtemp, {
  apply(target, receiver, arguments_) {
    const path: unknown = Reflect.apply(target, receiver, arguments_);
    if (typeof path !== "string" && !Buffer.isBuffer(path))
      throw new TypeError("Expected a native temporary directory path");
    owners.push({ release: () => rmSync(path, { recursive: true, force: true }) });
    return path;
  },
});
