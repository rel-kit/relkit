import { getJsonSchema } from "@relkit/schema";
import { frameworkTrace } from "@relkit/invocation";
import { isToolRef } from "@relkit/tools";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import { tool } from "langchain";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { modelToolName, runTool } from "./runtime-tools.js";

type RuntimeOptions = AgentRuntimeOptions & AgentInvocationOptions;

export interface NativeTools {
  readonly values: readonly (ClientTool | ServerTool)[];
  readonly publicIds: ReadonlyMap<string, string>;
  readonly relkitNames: ReadonlySet<string>;
  readonly failure: () => unknown;
}

export function createNativeTools(
  options: RuntimeOptions,
  signal: AbortSignal,
  maxOutputBytes: number,
  invocationId: string,
  traceId: string,
): NativeTools {
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
        try {
          const callId = config.toolCall?.id ?? crypto.randomUUID();
          return await frameworkTrace.span(
            `relkit.tool.${registered.id}`,
            {
              input,
              attributes: {
                "relkit.tool.id": registered.id,
                "relkit.tool.call.id": callId,
              },
            },
            () =>
              runTool(
                options,
                { callId, toolId: registered.id, input },
                signal,
                maxOutputBytes,
                invocationId,
                traceId,
              ),
          );
        } catch (error) {
          failure = error;
          return {
            error: { code: "RELKIT_APPROVAL_REQUIRED", message: "Tool call paused" },
          };
        }
      },
      {
        name,
        description: registered.description,
        schema: projection.schema as never,
      },
    );
  });
  return { values, publicIds, relkitNames, failure: () => failure };
}

function findTool(source: import("@relkit/tools").ToolSource, id: string) {
  if (Array.isArray(source)) return source.find((entry) => entry.id === id);
  if (source instanceof Map) {
    return source.get(id) ?? [...source.values()].find((entry) => entry.id === id);
  }
  const record = source as Readonly<Record<string, import("@relkit/tools").ToolDescriptor<string>>>;
  return record[id] ?? Object.values(record).find((entry) => entry.id === id);
}

function nativeName(value: ClientTool | ServerTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}
