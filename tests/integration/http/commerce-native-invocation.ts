/** Adapts the native descriptor ABI at this acceptance boundary without cloning its identity or parsing HTTP input early. */
import { invokeFunction } from "../../../packages/runtime-hono/node_modules/@relkit/engine/dist/index.js";
import type { StandaloneFunctionTarget } from "../../../packages/testing/src/index.ts";
import type { HttpInvocationOptions } from "../../../packages/runtime-hono/src/index.ts";

/**
 * Passes the original descriptor through the existing engine's dynamic ABI.
 * The SDK authoring type also permits declared errors and its Effect carrier;
 * native dispatch normalizes these before validating the declared output.
 * @param target - Identity-bearing original object, kept by reference.
 * @param input - Untrusted HTTP input validated by the engine.
 * @param options - Explicit native dependency replacements.
 * @returns The native engine's schema-validated dynamic HTTP output contract.
 */
export function invokeCommerceTarget(
  target: Pick<StandaloneFunctionTarget, "id" | "input" | "output">,
  input: HttpInvocationOptions["input"],
  options: Parameters<typeof invokeFunction>[2] = {},
) {
  if (typeof Reflect.get(target, "handler") !== "function")
    throw new TypeError("Native target must retain its callable handler");
  const native = target as Parameters<typeof invokeFunction>[0];
  return invokeFunction(native, input, options);
}
