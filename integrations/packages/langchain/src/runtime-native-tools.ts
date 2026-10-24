/** Combines authored native tools and RELKIT callable adapters for invocation, retaining input schemas and native dispatch identity. */

import { nativeToolEntry } from "./runtime-native-tool-build.js";
import { getJsonSchema } from "@relkit/schema";
import { frameworkTrace } from "@relkit/invocation";
import { isToolRef } from "@relkit/tools";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { tool } from "langchain";
import { Effect } from "effect";
import { observeAgent } from "@relkit/agents/internal/agent-telemetry";
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
        const context = {
          options,
          signal,
          maxOutputBytes,
          invocationId,
          traceId,
          identity,
          publicIds,
          relkitNames,
          setFailure: (cause: unknown) => {
            failure = cause;
          },
        };
        const values = options.agent.tools.map((entry, index) =>
          nativeToolEntry(entry, index, context),
        );
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
  return Effect.runSync(
    createNativeToolsEffect(options, signal, maxOutputBytes, invocationId, traceId).pipe(
      Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
      Effect.provide(NativeToolIdentityLive),
    ),
  );
}

function nativeName(value: ClientTool | ServerTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}
