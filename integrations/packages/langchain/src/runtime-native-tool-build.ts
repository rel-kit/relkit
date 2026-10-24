/**
 * Converts one checked reference into a native tool while preserving common-engine
 * execution, trace context and the deferred approval failure reader.
 */
import { getJsonSchema } from "@relkit/schema";
import { frameworkTrace } from "@relkit/invocation";
import { isToolRef, type ToolDescriptor } from "@relkit/tools";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { tool } from "langchain";
import { Effect } from "effect";
import { AgentInvocationFailure, agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { findTool, modelToolName, runToolEffect } from "./runtime-tools.js";
import type { AgentTool } from "./define-agent-native.types.js";
import type { NativeToolBuildContext } from "./runtime-native-tool-build.types.js";

/** Resolves one authored tool and records its public native mapping.
 * @param entry - RELKIT reference or native tool.
 * @param index - Authored position.
 * @param context - Invocation-owned mapping and failure authority.
 * @returns The native tool preserving the original validation boundary.
 */
export function nativeToolEntry(
  entry: AgentTool,
  index: number,
  context: NativeToolBuildContext,
): ClientTool | ServerTool | ReturnType<typeof tool> {
  const { options, publicIds, relkitNames } = context;
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

  return createRelkitNativeTool(registered, projection.schema, name, context);
}

/** Creates a callback after its descriptor/schema have been checked.
 * @param registered - RELKIT descriptor.
 * @param schema - Projected native input schema.
 * @param name - Stable model-facing name.
 * @param context - Invocation-owned dependencies.
 * @returns A native callback executing once through the common engine.
 */
function createRelkitNativeTool(
  registered: ToolDescriptor<string>,
  schema: Extract<ReturnType<typeof getJsonSchema>, { readonly ok: true }>["schema"],
  name: string,
  context: NativeToolBuildContext,
): ReturnType<typeof tool> {
  const { options, signal, maxOutputBytes, invocationId, traceId, identity } = context;
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
              attributes: {
                "relkit.tool.id": registered.id,
                "relkit.tool.call.id": callId,
              },
            },
            () =>
              Effect.runPromise(
                runToolEffect(
                  options,
                  { callId, toolId: registered.id, input },
                  combined,
                  maxOutputBytes,
                  invocationId,
                  traceId,
                ),
              ),
          );
        },
        catch: agentInvocationFailure,
      }).pipe(
        Effect.catchTag("AgentInvocationFailure", (error) =>
          recordNativeToolFailure(context, error),
        ),
      );
      return Effect.runPromise(result, { signal: config.signal ?? signal });
    },
    { name, description: registered.description, schema: schema as never },
  );
}

/** Records the deferred failure and returns the existing paused tool value.
 * @param context - Invocation failure authority.
 * @param error - Native callback failure.
 * @returns The canonical paused response expected by the native loop.
 */
function recordNativeToolFailure(context: NativeToolBuildContext, error: AgentInvocationFailure) {
  return Effect.sync(() => {
    context.setFailure(
      error.cause instanceof AgentInvocationFailure ? error.cause.cause : error.cause,
    );
    return { error: { code: "RELKIT_APPROVAL_REQUIRED", message: "Tool call paused" } };
  });
}

function nativeName(value: ClientTool | ServerTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}
