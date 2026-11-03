import { Metric, Schema } from "effect";

/** Expected client configuration failure in the Effect error channel. */
export class AgentClientPolicyError extends Schema.TaggedError<AgentClientPolicyError>()(
  "AgentClientPolicyError",
  { operation: Schema.String, message: Schema.String },
) {}

export const clientPolicyCount = Metric.counter("relkit.agents.client_policy.total");
export const clientPolicyFailures = Metric.counter("relkit.agents.client_policy.failure.total");
