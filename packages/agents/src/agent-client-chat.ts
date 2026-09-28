import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  AgentClientPolicyError,
  clientPolicyCount,
  clientPolicyFailures,
} from "./agent-client-error.js";
import type { AgentChatMapping } from "./agent-client.types.js";

/**
 * Validates the fixed chat input and output mapping.
 *
 * @param value - Candidate mapping.
 * @returns An Effect with a frozen mapping or AgentClientPolicyError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { copyAgentChatEffect } from "@relkit/agents";
 *
 * const chat = Effect.runSync(copyAgentChatEffect({ input: "message", output: "answer" }));
 * void chat;
 * ```
 */
export const copyAgentChatEffect = Effect.fn("Agents.clientPolicy.chat")(
  function* (value: unknown) {
    yield* Metric.update(clientPolicyCount, 1);
    if (value === undefined) return undefined;
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("input" in value) ||
      value.input !== "message" ||
      !("output" in value) ||
      value.output !== "answer"
    ) {
      yield* Metric.update(clientPolicyFailures, 1);
      return yield* Effect.fail(
        new AgentClientPolicyError({
          operation: "chat",
          message: 'Agent chat mapping must be { input: "message", output: "answer" }',
        }),
      );
    }
    return Object.freeze({ input: "message" as const, output: "answer" as const });
  },
  (effect) => observeAgent("client.chat", effect),
);

/**
 * Copies a chat mapping for synchronous descriptor callers.
 *
 * @param value - Candidate mapping.
 * @returns A frozen mapping or undefined.
 * @throws TypeError for a noncanonical mapping.
 * @example
 * ```ts
 * import { copyAgentChat } from "@relkit/agents";
 *
 * const chat = copyAgentChat({ input: "message", output: "answer" });
 * void chat;
 * ```
 */
export function copyAgentChat(value: unknown): AgentChatMapping | undefined {
  return Effect.runSync(
    copyAgentChatEffect(value).pipe(
      Effect.catchTag("AgentClientPolicyError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
