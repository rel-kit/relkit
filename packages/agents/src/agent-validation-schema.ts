import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import {
  AgentValidationError,
  validationCount,
  validationFailures,
} from "./agent-validation-error.js";

/**
 * Validates that a value implements the Standard Schema v1 protocol.
 *
 * @param value - Candidate schema.
 * @param name - Stable field name for diagnostics.
 * @returns An Effect with the schema or an AgentValidationError.
 * @example
 * const schema = Effect.runSync(assertAgentSchemaEffect(z.string(), "input"));
 */
export const assertAgentSchemaEffect = Effect.fn("Agents.validation.assertSchema")(
  function* (value: unknown, name: string) {
    yield* Metric.update(validationCount, 1);
    if (!schemaShape(value)) {
      yield* Metric.update(validationFailures, 1);
      return yield* Effect.fail(
        new AgentValidationError({
          operation: "assertAgentSchema",
          message: `Agent ${name} must be a Standard Schema v1 validator`,
        }),
      );
    }
    return value;
  },
  (effect) => observeAgent("validation.schema", effect),
);

/**
 * Throws for an invalid schema in existing synchronous authoring calls.
 *
 * @param value - Candidate schema.
 * @param name - Field name for diagnostics.
 * @returns Nothing; narrows the value to StandardSchemaV1.
 * @throws TypeError when the value is not a Standard Schema v1 validator.
 * @example
 * assertAgentSchema(z.string(), "input");
 */
export function assertAgentSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  Effect.runSync(
    assertAgentSchemaEffect(value, name).pipe(
      Effect.catchTag("AgentValidationError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}

/**
 * Checks the Standard Schema v1 protocol without throwing.
 *
 * @param value - Candidate schema.
 * @returns An Effect with a boolean; it has no typed failure.
 * @example
 * const valid = Effect.runSync(isAgentSchemaEffect(z.string()));
 */
export const isAgentSchemaEffect = Effect.fn("Agents.validation.isSchema")(
  function* (value: unknown) {
    const valid = yield* Effect.sync(() => schemaShape(value));
    yield* Metric.update(validationCount, 1);
    return valid;
  },
  (effect) => observeAgent("validation.is-schema", effect),
);

/**
 * Checks whether a candidate implements Standard Schema v1.
 *
 * @param value - Candidate schema.
 * @returns True when the schema protocol is present.
 * @example
 * if (isAgentSchema(value)) value["~standard"].validate(input);
 */
export function isAgentSchema(value: unknown): value is StandardSchemaV1 {
  return Effect.runSync(isAgentSchemaEffect(value));
}

function schemaShape(value: unknown): value is StandardSchemaV1 {
  if (!recordShape(value) || !recordShape(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function recordShape(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
