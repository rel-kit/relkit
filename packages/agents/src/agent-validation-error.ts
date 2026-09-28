import { Metric, Schema } from "effect";

/**
 * Typed validation failure raised by an Effect agent-authoring operation.
 *
 * @example
 * const error = new AgentValidationError({ operation: "positiveInteger", message: "limit must be positive" });
 */
export class AgentValidationError extends Schema.TaggedError<AgentValidationError>()(
  "AgentValidationError",
  { operation: Schema.String, message: Schema.String },
) {}

export const validationCount = Metric.counter("relkit.agents.validation.total");
export const validationFailures = Metric.counter("relkit.agents.validation.failure.total");
