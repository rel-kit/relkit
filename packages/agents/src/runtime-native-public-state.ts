import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { validateValueEffect } from "./runtime-utils.js";

/** Projects selected state keys from direct or nested native updates.
 * @param value - Native state update.
 * @param schemas - Public state validators.
 * @returns An Effect with projected state or AgentInvocationFailure.
 * @example await Effect.runPromise(selectedStateEffect(update, schemas));
 */
export const selectedStateEffect = Effect.fn("Agents.runtime.selectedState")(
  function* (value: unknown, schemas: ReadonlyMap<string, StandardSchemaV1>) {
    if (!isRecord(value) || schemas.size === 0) return undefined;
    const direct = yield* selectEffect(value, schemas);
    if (Object.keys(direct).length > 0) return direct;
    const outcomes = yield* Effect.forEach(
      Object.entries(value),
      ([name, update]) =>
        Effect.result(
          isRecord(update)
            ? selectEffect(update, schemas).pipe(
                Effect.map((selected) =>
                  Object.keys(selected).length === 0 ? undefined : ([name, selected] as const),
                ),
              )
            : Effect.succeed(undefined),
        ),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    const entries = outcomes.flatMap((outcome) =>
      Result.isSuccess(outcome) && outcome.success !== undefined ? [outcome.success] : [],
    );
    return entries.length === 0 ? undefined : Object.fromEntries(entries);
  },
  (effect) => observeAgent("runtime.selected-state", effect),
);

/** Validates selected fields from one state object with bounded concurrency.
 * @param value - State object.
 * @param schemas - Public state validators.
 * @returns An Effect with selected fields or AgentInvocationFailure.
 * @example await Effect.runPromise(selectEffect(state, schemas));
 */
export const selectEffect = Effect.fn("Agents.runtime.selectStateFields")(
  function* (value: Record<string, unknown>, schemas: ReadonlyMap<string, StandardSchemaV1>) {
    const outcomes = yield* Effect.forEach(
      [...schemas],
      ([key, schema]) =>
        Effect.result(
          value[key] === undefined
            ? Effect.succeed(undefined)
            : validateValueEffect(schema, value[key], "output").pipe(
                Effect.map((projected) => [key, projected] as const),
              ),
        ),
      { concurrency: 8 },
    );
    const firstFailure = outcomes.find(Result.isFailure);
    if (firstFailure !== undefined) return yield* Effect.fail(firstFailure.failure);
    return Object.fromEntries(
      outcomes.flatMap((outcome) =>
        Result.isSuccess(outcome) && outcome.success !== undefined ? [outcome.success] : [],
      ),
    );
  },
  (effect) => observeAgent("runtime.select-state-fields", effect),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
