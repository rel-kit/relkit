import type { ProtocolEvent } from "@langchain/langgraph";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentContentSink } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import {
  executionContext,
  isModelStart,
  isToolStart,
  trackExecutionContext,
} from "./runtime-native-events-helpers.js";
import { emitToolEvent } from "./runtime-native-event-tools.js";
import { NativeMessageAccumulator } from "./runtime-native-messages.js";
import { nativePublicEvent, type NativeExecutionContext } from "./runtime-native-public.js";
import { signalFailure, withSignal } from "./runtime-utils.js";

/** Collects native events with linked Effect interruption.
 * @param events - Native event stream.
 * @param sink - Optional client content sink.
 * @param toolIds - Public tool name mapping.
 * @param relkitNames - RELKIT owned tool names.
 * @param signal - Invocation cancellation signal.
 * @param limits - Model and tool call limits.
 * @param stateSchemas - Public state validators.
 * @param failure - Deferred native tool failure reader.
 * @param observe - Optional model/tool event observer.
 * @param abort - Native stream cancellation callback.
 * @param eventSchemas - Custom event validators.
 * @returns An Effect with void or AgentInvocationFailure.
 * @example await Effect.runPromise(collectNativeEventsEffect(events, sink, ids, names, signal, limits, schemas, failure, observe, abort));
 */
export const collectNativeEventsEffect = Effect.fn("Agents.runtime.collectNativeEvents")(
  (
    events: AsyncIterable<ProtocolEvent>,
    sink: AgentContentSink | undefined,
    toolIds: ReadonlyMap<string, string>,
    relkitNames: ReadonlySet<string>,
    signal: AbortSignal,
    limits: { readonly maxSteps: number; readonly maxToolCalls: number },
    stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
    failure: () => unknown,
    observe: ((event: ProtocolEvent) => void) | undefined,
    abort: (reason: unknown) => void,
    eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
  ) =>
    Effect.gen(function* () {
      if (signal.aborted) return yield* Effect.fail(agentInvocationFailure(signalFailure(signal)));
      yield* Effect.tryPromise({
        try: (effectSignal) =>
          collectNativeEventsCore(
            events,
            sink,
            toolIds,
            relkitNames,
            AbortSignal.any([signal, effectSignal]),
            limits,
            stateSchemas,
            failure,
            observe,
            abort,
            eventSchemas,
          ),
        catch: agentInvocationFailure,
      }).pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() =>
            abort(new AgentRuntimeError("RELKIT_AGENT_CANCELLED", "Agent invocation cancelled")),
          ),
        ),
      );
    }),
  (effect) => observeAgent("runtime.collect-native-events", effect),
);

/** Collects native events for existing Promise runtime callers.
 * @param events - Native event stream.
 * @param sink - Optional client content sink.
 * @param toolIds - Public tool name mapping.
 * @param relkitNames - RELKIT owned tool names.
 * @param signal - Invocation cancellation signal.
 * @param limits - Model and tool call limits.
 * @param stateSchemas - Public state validators.
 * @param failure - Deferred native tool failure reader.
 * @param observe - Optional model/tool event observer.
 * @param abort - Native stream cancellation callback.
 * @param eventSchemas - Custom event validators.
 * @returns A Promise that resolves after all events are delivered.
 * @throws The original stream, sink, validation, or cancellation error.
 * @example await collectNativeEvents(events, sink, ids, names, signal, limits, schemas, failure, observe, abort);
 */
export function collectNativeEvents(
  events: AsyncIterable<ProtocolEvent>,
  sink: AgentContentSink | undefined,
  toolIds: ReadonlyMap<string, string>,
  relkitNames: ReadonlySet<string>,
  signal: AbortSignal,
  limits: { readonly maxSteps: number; readonly maxToolCalls: number },
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  failure: () => unknown,
  observe: ((event: ProtocolEvent) => void) | undefined,
  abort: (reason: unknown) => void,
  eventSchemas: Readonly<Record<string, StandardSchemaV1>> = {},
): Promise<void> {
  return Effect.runPromise(
    collectNativeEventsEffect(
      events,
      sink,
      toolIds,
      relkitNames,
      signal,
      limits,
      stateSchemas,
      failure,
      observe,
      abort,
      eventSchemas,
    ).pipe(Effect.catchTag("AgentInvocationFailure", (error) => Effect.fail(error.cause))),
    { signal },
  );
}

async function collectNativeEventsCore(
  events: AsyncIterable<ProtocolEvent>,
  sink: AgentContentSink | undefined,
  toolIds: ReadonlyMap<string, string>,
  relkitNames: ReadonlySet<string>,
  signal: AbortSignal,
  limits: { readonly maxSteps: number; readonly maxToolCalls: number },
  stateSchemas: ReadonlyMap<string, StandardSchemaV1>,
  failure: () => unknown,
  observe: ((event: ProtocolEvent) => void) | undefined,
  abort: (reason: unknown) => void,
  eventSchemas: Readonly<Record<string, StandardSchemaV1>>,
): Promise<void> {
  let modelCalls = 0;
  let toolCalls = 0;
  const toolNames = new Map<string, string>();
  const contexts = new Map<string, NativeExecutionContext>();
  const messages = new NativeMessageAccumulator();
  for await (const event of events) {
    if (signal.aborted) throw signal.reason;
    if (isModelStart(event) && ++modelCalls > limits.maxSteps) {
      const error = new AgentRuntimeError("RELKIT_AGENT_STEP_LIMIT", "Agent step limit reached");
      abort(error);
      throw error;
    }
    if (isToolStart(event) && ++toolCalls > limits.maxToolCalls) {
      const error = new AgentRuntimeError(
        "RELKIT_AGENT_TOOL_LIMIT",
        "Agent tool-call limit reached",
      );
      abort(error);
      throw error;
    }
    trackExecutionContext(event, contexts);
    await emitToolEvent(event, sink, toolIds, relkitNames, toolNames, signal);
    observe?.(event);
    const publicEvent = await nativePublicEvent(
      event,
      stateSchemas,
      executionContext(event, contexts),
      eventSchemas,
    );
    if (sink?.emitEvent !== undefined)
      await withSignal(sink.emitEvent(publicEvent, signal), signal);
    const message = messages.update(publicEvent);
    if (message !== undefined && sink?.emitMessage !== undefined) {
      await withSignal(sink.emitMessage(message, signal), signal);
    }
    const toolFailure = failure();
    if (toolFailure !== undefined) {
      abort(toolFailure);
      throw toolFailure;
    }
  }
}
