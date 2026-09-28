import { Effect, Metric } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentCaptureRecord, AgentSpanCapture } from "./capture.types.js";

const spanCount = Metric.counter("relkit.agents.capture.span.total");

/**
 * Combines optional captured input and output for an agent span.
 *
 * @param input - Captured input, when enabled.
 * @param output - Captured output, when enabled.
 * @returns An Effect with immutable span capture or undefined; it has no typed failure.
 * @example
 * const capture = Effect.runSync(createAgentSpanCaptureEffect(input, output));
 */
export const createAgentSpanCaptureEffect = Effect.fn("Agents.capture.span")(
  function* (input: AgentCaptureRecord | undefined, output: AgentCaptureRecord | undefined) {
    yield* Metric.update(spanCount, 1);
    if (input === undefined && output === undefined) return undefined;
    return Object.freeze({
      ...(input === undefined ? {} : { input }),
      ...(output === undefined ? {} : { output }),
    });
  },
  (effect) => observeAgent("capture.span", effect),
);

/**
 * Combines captured input and output for synchronous runtime callers.
 *
 * @param input - Captured input, when enabled.
 * @param output - Captured output, when enabled.
 * @returns An immutable span capture or undefined.
 * @example
 * const capture = createAgentSpanCapture(input, output);
 */
export function createAgentSpanCapture(
  input: AgentCaptureRecord | undefined,
  output: AgentCaptureRecord | undefined,
): AgentSpanCapture | undefined {
  return Effect.runSync(createAgentSpanCaptureEffect(input, output));
}
