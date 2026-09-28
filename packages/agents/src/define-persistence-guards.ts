import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { RELKIT_PERSISTENCE } from "./persistence-symbol.js";
import type { PersistenceResource } from "./define-persistence.types.js";
import { agentPersistenceFailure } from "./persistence-error.js";

/** Checks whether a value is a RELKIT persistence resource descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isPersistenceResourceEffect(candidate));
 */
export const isPersistenceResourceEffect = Effect.fn("Agents.persistence.isResource")(
  (value: unknown) => Effect.sync(() =>
    isRecord(value) &&
    value[RELKIT_PERSISTENCE] === true &&
    value.kind === "agent-persistence" &&
    (value.resource === "checkpointer" || value.resource === "memory") &&
    typeof value.acquire === "function" &&
    typeof value.release === "function"),
  (effect) => observeAgent("persistence.is-resource", effect),
);

/** Checks a resource for existing synchronous callers.
 * @param value - Candidate descriptor.
 * @returns Whether the descriptor follows the persistence protocol.
 * @example if (isPersistenceResource(value)) await value.acquire(context);
 */
export function isPersistenceResource(value: unknown): value is PersistenceResource<any, any> {
  return Effect.runSync(isPersistenceResourceEffect(value));
}

/** Validates a resolved LangGraph checkpointer or memory store.
 * @param resource - Expected persistence role.
 * @param value - Resolved client handle.
 * @returns An Effect with void or AgentPersistenceFailure.
 * @example Effect.runSync(assertPersistenceProtocolEffect("memory", store));
 */
export const assertPersistenceProtocolEffect = Effect.fn("Agents.persistence.assertProtocol")(
  (resource: "checkpointer" | "memory", value: unknown) => Effect.try({
    try: () => {
      const methods = resource === "checkpointer"
        ? ["getTuple", "list", "put", "putWrites", "deleteThread"]
        : ["batch"];
      if (!isRecord(value) || methods.some((method) => typeof value[method] !== "function")) {
        throw new TypeError(`${resource} resource does not implement the LangGraph protocol`);
      }
    },
    catch: agentPersistenceFailure,
  }),
  (effect) => observeAgent("persistence.assert-protocol", effect),
);

/** Validates a resolved handle for existing synchronous callers.
 * @param resource - Expected persistence role.
 * @param value - Resolved client handle.
 * @returns Nothing when the protocol is present.
 * @throws The original protocol TypeError.
 * @example assertPersistenceProtocol("memory", store);
 */
export function assertPersistenceProtocol(
  resource: "checkpointer" | "memory",
  value: unknown,
): asserts value is BaseCheckpointSaver | BaseStore {
  Effect.runSync(assertPersistenceProtocolEffect(resource, value).pipe(
    Effect.catchTag("AgentPersistenceFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
