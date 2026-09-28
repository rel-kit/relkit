import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  AgentClientPolicyError,
  clientPolicyCount,
  clientPolicyFailures,
} from "./agent-client-error.js";
import type { AgentControl } from "./agent-client.types.js";

const allowed = new Set<AgentControl>(["steer", "follow-up", "stop", "approve"]);

/**
 * Validates and freezes client control capabilities.
 *
 * @param value - Candidate capability list.
 * @returns An Effect with the list or AgentClientPolicyError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { copyAgentControlsEffect } from "@relkit/agents";
 *
 * const controls = Effect.runSync(copyAgentControlsEffect(["stop"]));
 * void controls;
 * ```
 */
export const copyAgentControlsEffect = Effect.fn("Agents.clientPolicy.controls")(
  function* (value: unknown) {
    yield* Metric.update(clientPolicyCount, 1);
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      yield* Metric.update(clientPolicyFailures, 1);
      return yield* Effect.fail(
        new AgentClientPolicyError({
          operation: "controls",
          message: "Agent controls must be an array",
        }),
      );
    }
    if (!value.every((control): control is AgentControl => allowed.has(control))) {
      yield* Metric.update(clientPolicyFailures, 1);
      return yield* Effect.fail(
        new AgentClientPolicyError({
          operation: "controls",
          message: "Agent controls contain an unsupported capability",
        }),
      );
    }
    if (new Set(value).size !== value.length) {
      yield* Metric.update(clientPolicyFailures, 1);
      return yield* Effect.fail(
        new AgentClientPolicyError({
          operation: "controls",
          message: "Agent controls must be unique",
        }),
      );
    }
    return Object.freeze([...value]) as readonly AgentControl[];
  },
  (effect) => observeAgent("client.controls", effect),
);

/**
 * Copies client controls for synchronous descriptor callers.
 *
 * @param value - Candidate capability list.
 * @returns A frozen list or undefined.
 * @throws TypeError when an unsupported or duplicate control is present.
 * @example
 * ```ts
 * import { copyAgentControls } from "@relkit/agents";
 *
 * const controls = copyAgentControls(["stop"]);
 * void controls;
 * ```
 */
export function copyAgentControls(value: unknown): readonly AgentControl[] | undefined {
  return Effect.runSync(
    copyAgentControlsEffect(value).pipe(
      Effect.catchTag("AgentClientPolicyError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
