/**
 * Carries one native loop's already acquired runnable, identity, state selection
 * and signal to stream/settlement helpers without allocating another lifetime.
 */
import type { AgentLoopOptions } from "./runtime-loop.types.js";
import type { createNativeAgent } from "./runtime-native-agent.js";
import type { createLoopTelemetry } from "./runtime-loop-telemetry.js";

export interface NativeAgentLoopContext {
  readonly options: AgentLoopOptions;
  readonly native: Awaited<ReturnType<typeof createNativeAgent>>;
  readonly config: { readonly configurable?: { readonly thread_id: string } };
  readonly input: unknown;
  readonly signal: AbortSignal;
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
  readonly observe: ReturnType<typeof createLoopTelemetry>;
}
