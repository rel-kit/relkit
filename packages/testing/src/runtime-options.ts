import { resolveEnv, type EnvShape } from "@relkit/config";
import type { TestRuntimeOptions } from "./runtime.js";

/**
 * Resolves explicit values through the application's existing environment authority.
 * @typeParam S - Application environment declaration shape retained through inference.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns Immutable validated values without ambient process environment fallback.
 */
export function resolveRuntimeEnv<S extends EnvShape>(
  options: TestRuntimeOptions<S>,
): Readonly<Record<string, unknown>> {
  assertEnvRecord(options.env);
  if (options.app === undefined) return Object.freeze({ ...(options.env ?? {}) });
  const source: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(options.env ?? {})) {
    source[name] = toEnvSource(value);
  }
  return resolveEnv(options.app.env, {
    environment: options.environment ?? "test",
    source,
  });
}

/**
 * Checks the outer shape of an explicit environment override.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Nothing for an absent or non-array object override.
 */
function assertEnvRecord(
  value: unknown,
): asserts value is Readonly<Record<string, unknown>> | undefined {
  if (
    value !== undefined &&
    (value === null || typeof value !== "object" || Array.isArray(value))
  ) {
    throw new TypeError("Test runtime env must be an object");
  }
}

/**
 * Serializes an explicit environment value for the production resolver.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The existing string representation, or undefined for an absent value.
 */
function toEnvSource(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof URL) return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Test environment values must be serializable");
  return json;
}

/**
 * Rejects invalid close deadlines before allocating native resources.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns Nothing for a non-negative safe integer.
 */
export function validateRuntimeTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("closeTimeoutMs must be a non-negative integer");
  }
}
