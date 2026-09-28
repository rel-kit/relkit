import { getJsonSchema } from "@relkit/schema";
import { frameworkTrace } from "@relkit/invocation";
import { isToolRef } from "@relkit/tools";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { tool } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { AgentInvocationFailure, agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { NativeToolIdentity, NativeToolIdentityLive } from "./runtime-native-tools-identity.js";
import type { NativeTools, NativeToolRuntimeOptions } from "./runtime-native-tools.types.js";
import { findTool, modelToolName, runToolEffect } from "./runtime-tools.js";

export type { NativeTools } from "./runtime-native-tools.types.js";
export { NativeToolIdentity, NativeToolIdentityLive } from "./runtime-native-tools-identity.js";

/** Materializes LangChain tools with public IDs and an invocation failure reader.
 * @param options - Runtime integrations and authored tools.
 * @param signal - Invocation cancellation signal.
 * @param maxOutputBytes - Tool result byte cap.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @returns An Effect with native tools or AgentInvocationFailure.
 * @example Effect.runSync(Effect.provide(createNativeToolsEffect(options, signal, 1024, id, trace), NativeToolIdentityLive));
 */
export const createNativeToolsEffect = Effect.fn("Agents.runtime.createNativeTools")(
  function* (
    options: NativeToolRuntimeOptions,
    signal: AbortSignal,
    maxOutputBytes: number,
    invocationId: string,
    traceId: string,
  ) {
    const identity = yield* NativeToolIdentity;
    return yield* Effect.try({
      try: (): NativeTools => {
        const publicIds = new Map<string, string>();
        const relkitNames = new Set<string>();
        let failure: unknown;
        const values = options.agent.tools.map((entry, index) => {
          if (!isToolRef(entry)) {
            const name = nativeName(entry);
            if (name !== undefined) publicIds.set(name, name);
            return entry;
          }
          const registered = findTool(options.tools, entry.ref.id);
          if (registered === undefined) {
            throw new AgentRuntimeError("RELKIT_TOOL_UNKNOWN", "Agent tool is not registered");
          }
          const projection = getJsonSchema(registered.target.input);
          if (!projection.ok) {
            throw new AgentRuntimeError("RELKIT_SCHEMA_UNAVAILABLE", "Tool input schema is unavailable");
          }
          const name = modelToolName(registered.id, index);
          publicIds.set(name, registered.id);
          relkitNames.add(name);
          return tool(
            async (input, config) => {
              const callId = config.toolCall?.id ?? identity.randomUUID();
              const result = Effect.tryPromise({
                try: (effectSignal) => {
                  const combined = AbortSignal.any([signal, effectSignal]);
                  return frameworkTrace.span(
                    `relkit.tool.${registered.id}`,
                    {
                      input,
                      attributes: { "relkit.tool.id": registered.id, "relkit.tool.call.id": callId },
                    },
                    () => Effect.runPromise(runToolEffect(
                      options, { callId, toolId: registered.id, input }, combined,
                      maxOutputBytes, invocationId, traceId,
                    )),
                  );
                },
                catch: agentInvocationFailure,
              }).pipe(Effect.catchTag("AgentInvocationFailure", (error) => Effect.sync(() => {
                failure = error.cause instanceof AgentInvocationFailure ? error.cause.cause : error.cause;
                return { error: { code: "RELKIT_APPROVAL_REQUIRED", message: "Tool call paused" } };
              })));
              return Effect.runPromise(result, { signal: config.signal ?? signal });
            },
            { name, description: registered.description, schema: projection.schema as never },
          );
        });
        return { values, publicIds, relkitNames, failure: () => failure };
      },
      catch: agentInvocationFailure,
    });
  },
  (effect) => observeAgent("runtime.create-native-tools", effect),
);

/** Materializes native tools for existing synchronous callers.
 * @param options - Runtime integrations and authored tools.
 * @param signal - Invocation cancellation signal.
 * @param maxOutputBytes - Tool result byte cap.
 * @param invocationId - Stable invocation identity.
 * @param traceId - Trace identity.
 * @returns Native tools with public ID mappings.
 * @throws The original unknown tool or schema error.
 * @example createNativeTools(options, signal, 1024, id, trace);
 */
export function createNativeTools(
  options: NativeToolRuntimeOptions,
  signal: AbortSignal,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
): NativeTools {
  return Effect.runSync(createNativeToolsEffect(options, signal, maxOutputBytes, invocationId, traceId).pipe(
    Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(NativeToolIdentityLive),
  ));
}

function nativeName(value: ClientTool | ServerTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}
