import { Effect, Metric, Schema } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentCapturePolicy } from "./capture.types.js";

const DEFAULT_REDACT_KEYS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "api-key",
  "apikey",
  "credential",
];
const policyCount = Metric.counter("relkit.agents.capture.policy.total");
const policyFailures = Metric.counter("relkit.agents.capture.policy.failure.total");

/** Invalid capture configuration in the Effect error channel. */
export class AgentCapturePolicyError extends Schema.TaggedError<AgentCapturePolicyError>()(
  "AgentCapturePolicyError",
  { message: Schema.String },
) {}

/**
 * Validates and freezes a content capture policy.
 *
 * @param value - Optional policy; undefined disables capture.
 * @returns An Effect with the canonical policy or AgentCapturePolicyError.
 * @example
 * const policy = Effect.runSync(createAgentCapturePolicyEffect({ mode: "off" }));
 */
export const createAgentCapturePolicyEffect = Effect.fn("Agents.capture.policy")(
  function* (value: AgentCapturePolicy | undefined) {
    yield* Metric.update(policyCount, 1);
    if (value === undefined || value.mode === "off") {
      return Object.freeze({ mode: "off" }) as AgentCapturePolicy;
    }
    if (value.mode !== "development-redacted") {
      yield* Metric.update(policyFailures, 1);
      return yield* Effect.fail(
        new AgentCapturePolicyError({
          message: "Agent capture mode must be off or development-redacted",
        }),
      );
    }
    const maxBytes = value.maxBytes;
    if (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      yield* Metric.update(policyFailures, 1);
      return yield* Effect.fail(
        new AgentCapturePolicyError({
          message: "Agent capture maxBytes must be a positive safe integer",
        }),
      );
    }
    if (
      !Array.isArray(value.redactKeys ?? []) ||
      (value.redactKeys ?? []).some((key) => typeof key !== "string")
    ) {
      yield* Metric.update(policyFailures, 1);
      return yield* Effect.fail(
        new AgentCapturePolicyError({
          message: "Agent capture redactKeys must be text values",
        }),
      );
    }
    return Object.freeze({
      mode: "development-redacted" as const,
      maxBytes,
      redactKeys: Object.freeze([
        ...new Set([
          ...DEFAULT_REDACT_KEYS,
          ...(value.redactKeys ?? []).map((key) => key.toLowerCase()),
        ]),
      ]),
    });
  },
  (effect) => observeAgent("capture.policy", effect),
);

/**
 * Creates a capture policy for synchronous descriptor callers.
 *
 * @param value - Optional policy; undefined disables capture.
 * @returns The frozen canonical policy.
 * @throws TypeError when mode, size, or redaction keys are invalid.
 * @example
 * const policy = createAgentCapturePolicy({ mode: "development-redacted", maxBytes: 1024 });
 */
export function createAgentCapturePolicy(
  value: AgentCapturePolicy | undefined,
): AgentCapturePolicy {
  return Effect.runSync(
    createAgentCapturePolicyEffect(value).pipe(
      Effect.catchTag("AgentCapturePolicyError", (error) =>
        Effect.sync(() => {
          throw new TypeError(error.message);
        }),
      ),
    ),
  );
}
