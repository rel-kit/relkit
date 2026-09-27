import { Effect } from "effect";
import { observeService, runServiceSync } from "./service-observability.js";

/** Copy and freeze a plain service context graph, preserving cycles and identity.
 * @param value - Root context value.
 * @param seen - Shared memo for recursive or repeated references.
 * @returns An Effect of the frozen copy; exotic objects retain identity.
 * @example Effect.runSync(freezeServiceContextValueEffect({ enabled: true }, new WeakMap()));
 */
export const freezeServiceContextValueEffect = Effect.fn("Services.freezeContext")(
  (value: unknown, seen: WeakMap<object, object>): Effect.Effect<unknown> =>
    observeService("context.freeze", freezeNode(value, seen)),
);

/** Copy and freeze a plain service context graph synchronously.
 * @param value - Root context value.
 * @param seen - Shared memo for recursive or repeated references.
 * @returns A frozen copy, or the original exotic object.
 * @throws When a proxy or getter prevents graph inspection.
 * @example freezeServiceContextValue({ enabled: true }, new WeakMap());
 */
export function freezeServiceContextValue(value: unknown, seen: WeakMap<object, object>): unknown {
  return runServiceSync(freezeServiceContextValueEffect(value, seen));
}

/** Traverse one node within the root operation's span. */
function freezeNode(value: unknown, seen: WeakMap<object, object>): Effect.Effect<unknown> {
  return Effect.gen(function* () {
    if (value === null || typeof value !== "object") return value;
    const existing = seen.get(value);
    if (existing !== undefined) return existing;
    if (Array.isArray(value)) {
      const copy: unknown[] = [];
      seen.set(value, copy);
      for (const item of value) copy.push(yield* freezeNode(item, seen));
      return Object.freeze(copy);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const copy: Record<string, unknown> = {};
    seen.set(value, copy);
    for (const [key, child] of Object.entries(value)) copy[key] = yield* freezeNode(child, seen);
    return Object.freeze(copy);
  });
}
