import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isAgentSchemaEffect } from "./agent-validation-schema.js";
import {
  AgentClientPolicyError,
  clientPolicyCount,
  clientPolicyFailures,
} from "./agent-client-error.js";
import type { AgentClientEvents, AgentClientPolicy } from "./agent-client.types.js";

/**
 * Validates and freezes client access, state keys, and event schemas.
 *
 * @param value - Candidate policy.
 * @param allowedStateKeys - State names declared by middleware.
 * @returns An Effect with a policy, undefined, or AgentClientPolicyError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { copyAgentClientPolicyEffect } from "@relkit/agents";
 *
 * const policy = Effect.runSync(copyAgentClientPolicyEffect({ public: true }, new Set<string>()));
 * void policy;
 * ```
 */
export const copyAgentClientPolicyEffect = Effect.fn("Agents.clientPolicy.copy")(function* <
  StateKey extends string,
>(value: unknown, allowedStateKeys: ReadonlySet<StateKey> = new Set()) {
  yield* Metric.update(clientPolicyCount, 1);
  if (value === undefined) return undefined;
  if (!isRecord(value)) return yield* reject("Agent client policy must be an object");
  const publicAccess = value.public === true;
  const authorize = isGuard(value.authorize) ? value.authorize : undefined;
  if (publicAccess === (authorize !== undefined)) {
    return yield* reject("Agent client policy requires exactly one of public or authorize");
  }
  const state = yield* copyStateKeys(value.state, allowedStateKeys);
  const events = yield* copyEvents(value.events);
  if (publicAccess) {
    return Object.freeze({
      public: true as const,
      ...(state === undefined ? {} : { state }),
      ...events,
    });
  }
  if (authorize === undefined) {
    return yield* reject("Agent client policy requires exactly one of public or authorize");
  }
  return Object.freeze({ authorize, ...(state === undefined ? {} : { state }), ...events });
}, (effect) => observeAgent("client.copy", effect));

/**
 * Copies a client policy for synchronous descriptor callers.
 *
 * @param value - Candidate policy.
 * @param allowedStateKeys - State names declared by middleware.
 * @returns A frozen policy or undefined.
 * @throws TypeError for malformed access, state, or event declarations.
 * @example
 * ```ts
 * import { copyAgentClientPolicy } from "@relkit/agents";
 *
 * const policy = copyAgentClientPolicy({ public: true }, new Set<string>());
 * void policy;
 * ```
 */
export function copyAgentClientPolicy<StateKey extends string>(
  value: unknown,
  allowedStateKeys: ReadonlySet<StateKey> = new Set(),
): AgentClientPolicy<(...args: any[]) => unknown, StateKey> | undefined {
  return Effect.runSync(
    copyAgentClientPolicyEffect(value, allowedStateKeys).pipe(
      Effect.catchTag("AgentClientPolicyError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/** Validates event names and schemas; failure remains in the Effect error channel. */
function copyEvents(
  value: unknown,
): Effect.Effect<{ readonly events?: AgentClientEvents }, AgentClientPolicyError> {
  return Effect.gen(function* () {
    if (value === undefined) return {};
    if (!isRecord(value)) return yield* reject("Agent client events must be an object");
    for (const [name, event] of Object.entries(value)) {
      if (name.trim() === "" || !(yield* isAgentSchemaEffect(event))) {
        return yield* reject(`Agent client event "${name}" must be a Standard Schema v1 validator`);
      }
    }
    return { events: Object.freeze({ ...value }) as AgentClientEvents };
  });
}

/** Copies middleware state keys after checking shape, uniqueness, and declaration. */
function copyStateKeys<StateKey extends string>(
  value: unknown,
  allowed: ReadonlySet<StateKey>,
): Effect.Effect<readonly StateKey[] | undefined, AgentClientPolicyError> {
  return Effect.gen(function* () {
    if (value === undefined) return undefined;
    if (
      !Array.isArray(value) ||
      value.some((key) => typeof key !== "string" || key.trim() === "")
    ) {
      return yield* reject("Agent client state must be an array of middleware state keys");
    }
    if (new Set(value).size !== value.length)
      return yield* reject("Agent client state must be unique");
    for (const key of value) {
      if (!allowed.has(key))
        return yield* reject(`Agent client state key "${key}" is not declared`);
    }
    return Object.freeze([...value]) as readonly StateKey[];
  });
}

function reject(message: string): Effect.Effect<never, AgentClientPolicyError> {
  return Effect.gen(function* () {
    yield* Metric.update(clientPolicyFailures, 1);
    return yield* Effect.fail(new AgentClientPolicyError({ operation: "policy", message }));
  });
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGuard(value: unknown): value is (...args: any[]) => unknown {
  return typeof value === "function";
}
