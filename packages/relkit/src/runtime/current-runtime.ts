/** Detects the runtime this process runs on and loads its adapter on first use. */
import type { RuntimeAdapter, RuntimeAdapterName } from "./runtime-adapter.types.js";

let current: Promise<RuntimeAdapter> | undefined;

/** @returns The runtime this process runs on. */
export function detectRuntime(): RuntimeAdapterName {
  // Workers report this user agent; `process` exists there only through `nodejs_compat`.
  if (globalThis.navigator?.userAgent === "Cloudflare-Workers") return "workers";
  return typeof process.versions.bun === "string" ? "bun" : "node";
}

/**
 * Loads one runtime's adapter.
 * @param name - Runtime to load; defaults to the detected runtime.
 * @returns The adapter.
 */
export async function loadRuntimeAdapter(
  name: RuntimeAdapterName = detectRuntime(),
): Promise<RuntimeAdapter> {
  if (name === "bun") return (await import("./bun/index.js")).bunRuntime;
  if (name === "workers") return (await import("./workers/index.js")).workersRuntime;
  return (await import("./node/index.js")).nodeRuntime;
}

/** @returns The detected runtime's adapter, loaded once per process. */
export function currentRuntime(): Promise<RuntimeAdapter> {
  current ??= loadRuntimeAdapter();
  return current;
}
