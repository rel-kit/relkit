/** Detects the runtime this process runs on and loads its adapter on first use. */
import type { RuntimeAdapter, RuntimeName } from "./runtime-adapter.types.js";

let current: Promise<RuntimeAdapter> | undefined;

/** @returns The runtime this process runs on. */
export function detectRuntime(): RuntimeName {
  return typeof process.versions.bun === "string" ? "bun" : "node";
}

/**
 * Loads one runtime's adapter.
 * @param name - Runtime to load; defaults to the detected runtime.
 * @returns The adapter.
 */
export async function loadRuntimeAdapter(
  name: RuntimeName = detectRuntime(),
): Promise<RuntimeAdapter> {
  if (name === "bun") return (await import("./bun/index.js")).bunRuntime;
  return (await import("./node/index.js")).nodeRuntime;
}

/** @returns The detected runtime's adapter, loaded once per process. */
export function currentRuntime(): Promise<RuntimeAdapter> {
  current ??= loadRuntimeAdapter();
  return current;
}
