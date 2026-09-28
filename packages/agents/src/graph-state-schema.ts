import { StateSchema, type AnyStateSchema } from "@langchain/langgraph";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import { Effect, Metric, Schema } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { AgentRuntimeError } from "./runtime-errors.js";

const selectionCount = Metric.counter("relkit.agents.graph_state.selection.total");
const selectionFailures = Metric.counter("relkit.agents.graph_state.selection.failure.total");

/** Expected graph state projection failure in the Effect error channel. */
export class GraphStateSelectionError extends Schema.TaggedError<GraphStateSelectionError>()(
  "GraphStateSelectionError",
  { code: Schema.String, message: Schema.String },
) {}

/**
 * Projects a graph state to the fields declared by a client selection schema.
 *
 * @param state - LangGraph state definition to project.
 * @param selection - Standard Schema describing the selected fields.
 * @returns An Effect with the selected StateSchema or GraphStateSelectionError.
 * @throws A defect if LangGraph rejects an otherwise valid StateSchema construction.
 * @example
 * const projected = Effect.runSync(selectGraphStateEffect(state, z.object({ answer: z.string() })));
 */
export const selectGraphStateEffect = Effect.fn("Agents.graphState.select")(
  function* (state: AnyStateSchema, selection: StandardSchemaV1) {
    yield* Metric.update(selectionCount, 1);
    const projection = yield* Effect.sync(() => getJsonSchema(selection));
    const properties = projection.ok ? projection.schema.properties : undefined;
    if (!isRecord(properties)) {
      yield* Metric.update(selectionFailures, 1);
      return yield* Effect.fail(
        new GraphStateSelectionError({
          code: "RELKIT_SCHEMA_UNAVAILABLE",
          message: "Graph state selection is unavailable",
        }),
      );
    }
    const selected: Record<string, (typeof state.fields)[string]> = {};
    for (const key of Object.keys(properties)) {
      const field = state.fields[key];
      if (field === undefined) {
        yield* Metric.update(selectionFailures, 1);
        return yield* Effect.fail(
          new GraphStateSelectionError({
            code: "RELKIT_SCHEMA_UNAVAILABLE",
            message: `Graph state field "${key}" is unavailable`,
          }),
        );
      }
      selected[key] = field;
    }
    return yield* Effect.sync(() => new StateSchema(selected));
  },
  (effect) => observeAgent("graph-state.select", effect),
);

/**
 * Projects graph state for existing synchronous graph definition callers.
 *
 * @param state - LangGraph state definition to project.
 * @param selection - Schema describing selected fields.
 * @returns A new StateSchema with only those fields.
 * @throws AgentRuntimeError when the selection or one of its fields is unavailable.
 * @example
 * const projected = selectGraphState(state, z.object({ answer: z.string() }));
 */
export function selectGraphState(
  state: AnyStateSchema,
  selection: StandardSchemaV1,
): AnyStateSchema {
  return Effect.runSync(
    selectGraphStateEffect(state, selection).pipe(
      Effect.catchTag("GraphStateSelectionError", (error) =>
        Effect.sync(() => {
          throw new AgentRuntimeError(error.code, error.message);
        }),
      ),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
