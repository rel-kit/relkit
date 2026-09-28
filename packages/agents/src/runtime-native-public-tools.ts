import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";

/** Projects a native tool result to its public value.
 * @param value - Native result or serialized result.
 * @returns An Effect with the public tool value.
 * @example Effect.runSync(publicToolValueEffect(result));
 */
export const publicToolValueEffect = Effect.fn("Agents.runtime.publicToolValue")(
  (value: unknown) => Effect.sync(() => publicToolValueCore(value)),
  (effect) => observeAgent("runtime.public-tool-value", effect),
);

/** Projects a native tool result for existing synchronous callers.
 * @param value - Native result or serialized result.
 * @returns Public tool value.
 * @example publicToolValue(result);
 */
export function publicToolValue(value: unknown): unknown {
  return Effect.runSync(publicToolValueEffect(value));
}

function publicToolValueCore(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  if (isRecord(value) && value.lg_name === "Command") {
    const update = value.update;
    const messages = isRecord(update) && Array.isArray(update.messages) ? update.messages : [];
    return messages.length === 0 ? { completed: true } : publicToolValueCore(messages.at(-1));
  }
  if (!isRecord(value) || !("content" in value)) return value;
  return publicToolValueCore(value.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
