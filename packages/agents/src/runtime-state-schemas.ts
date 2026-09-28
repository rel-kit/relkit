import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";

/** Resolves validators for selected public state keys.
 * @param sources - State schema sources in precedence order.
 * @param selected - Public state keys.
 * @returns An Effect with validators or AgentInvocationFailure.
 * @example Effect.runSync(selectedStateSchemasEffect([state], ["answer"]));
 */
export const selectedStateSchemasEffect = Effect.fn("Agents.runtime.selectedStateSchemas")(
  (sources: readonly unknown[], selected: readonly string[]) =>
    Effect.try({
      try: () => selectedStateSchemasCore(sources, selected),
      catch: agentInvocationFailure,
    }),
  (effect) => observeAgent("runtime.selected-state-schemas", effect),
);

/** Resolves public state validators for existing synchronous callers.
 * @param sources - State schema sources in precedence order.
 * @param selected - Public state keys.
 * @returns A map of selected validators.
 * @throws TypeError for a selected key without a validator.
 * @example selectedStateSchemas([state], ["answer"]);
 */
export function selectedStateSchemas(
  sources: readonly unknown[],
  selected: readonly string[],
): ReadonlyMap<string, StandardSchemaV1> {
  return Effect.runSync(
    selectedStateSchemasEffect(sources, selected).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

function selectedStateSchemasCore(
  sources: readonly unknown[],
  selected: readonly string[],
): ReadonlyMap<string, StandardSchemaV1> {
  const schemas = new Map<string, StandardSchemaV1>();
  for (const source of sources) {
    const fields = stateFields(source);
    for (const key of selected) {
      const schema = fields?.[key];
      if (isStandardSchema(schema)) schemas.set(key, schema);
    }
  }
  for (const key of selected) {
    if (!schemas.has(key)) throw new TypeError(`Agent client state key "${key}" has no validator`);
  }
  return schemas;
}

function stateFields(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isRecord(value.fields)) return value.fields;
  const shape = typeof value.shape === "function" ? value.shape() : value.shape;
  return isRecord(shape) ? shape : undefined;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
