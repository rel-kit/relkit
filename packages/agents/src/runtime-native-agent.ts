import {
  createAgent,
  StructuredOutputParsingError,
  toolStrategy,
  type AnyAgentMiddleware,
} from "langchain";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type { AgentDescriptor } from "./define-agent.js";
import { hasDeepAgentCapabilities } from "./define-agent-deep.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import { resolveRuntimeModel } from "./runtime-model.js";
import { createNativeTools, type NativeTools } from "./runtime-native-tools.js";
import { resolveAgentPersistence } from "./graph-persistence.js";
import { createThreadBucketBackend } from "./deepagent-bucket-scope.js";
import { createNativeLimitMiddleware } from "./runtime-native-limits.js";
import {
  combineNativeTools,
  loadDeepAgents,
  nativeInstructions,
} from "./runtime-native-support.js";

type RuntimeOptions = Omit<AgentRuntimeOptions, "agent"> &
  AgentInvocationOptions & { readonly agent: AgentDescriptor<string, unknown, unknown> };
type NativeAgent = ReturnType<typeof createAgent>;
export { StructuredOutputParsingError };

export async function createNativeAgent(options: {
  readonly runtime: RuntimeOptions;
  readonly model: string | import("@langchain/core/language_models/base").LanguageModelLike;
  readonly signal: AbortSignal;
  readonly maxOutputBytes: number;
  readonly invocationId: string;
  readonly traceId: string;
}): Promise<{ readonly agent: NativeAgent; readonly tools: NativeTools }> {
  const { runtime } = options;
  const tools = createTools(runtime, options, runtime.agent);
  const persistence = await resolveAgentPersistence(runtime.agent, runtime.environment ?? {});
  const limitMiddleware = createNativeLimitMiddleware(runtime.agent.limits);
  const common = {
    name: runtime.agent.id,
    model: options.model,
    systemPrompt: nativeInstructions(runtime.agent),
    tools: [...tools.values],
    middleware: [
      ...(runtime.agent.middleware as unknown as readonly AnyAgentMiddleware[]),
      limitMiddleware,
    ],
    responseFormat: responseFormat(runtime.agent.output),
    ...persistence,
  };
  if (!hasDeepAgentCapabilities(runtime.agent)) {
    return { agent: createAgent(common), tools };
  }
  const deepagents = await loadDeepAgents();
  const backend =
    runtime.bucketBackend === undefined
      ? runtime.agent.backend
      : createThreadBucketBackend(runtime.bucketBackend, runtime.agent.id, runtime.threadId ?? "");
  const groups = [tools];
  const subagents = await createSubagents(
    runtime.agent.subagents ?? [],
    options.model,
    backend,
    runtime,
    options,
    groups,
    deepagents,
    limitMiddleware,
  );
  const agent = deepagents.createDeepAgent({
    ...common,
    subagents,
    ...(runtime.agent.skills === undefined ? {} : { skills: [...runtime.agent.skills] }),
    ...(runtime.agent.memory === undefined ? {} : { memory: [...runtime.agent.memory] }),
    ...(backend === undefined ? {} : { backend }),
    ...(runtime.agent.interruptOn === undefined ? {} : { interruptOn: runtime.agent.interruptOn }),
  } as never);
  return { agent: agent as unknown as NativeAgent, tools: combineNativeTools(groups) };
}

async function createSubagents(
  children: readonly AgentDescriptor<string, unknown, unknown>[],
  inheritedModel: Parameters<typeof childModel>[1],
  inheritedBackend: unknown,
  runtime: RuntimeOptions,
  options: Omit<Parameters<typeof createNativeAgent>[0], "runtime">,
  groups: NativeTools[],
  deepagents: typeof import("deepagents"),
  limitMiddleware: AnyAgentMiddleware,
): Promise<unknown[]> {
  const subagents: unknown[] = [];
  for (const child of children) {
    const childTools = createTools(runtime, options, child);
    groups.push(childTools);
    const model = await childModel(child, inheritedModel, runtime);
    const common = {
      name: child.id,
      model,
      systemPrompt: nativeInstructions(child),
      tools: [...childTools.values],
      middleware: [
        ...(child.middleware as unknown as readonly AnyAgentMiddleware[]),
        limitMiddleware,
      ],
      responseFormat: responseFormat(child.output),
    };
    if (!hasDeepAgentCapabilities(child)) {
      subagents.push({
        ...common,
        description: child.description ?? child.title ?? child.id,
      });
      continue;
    }
    const backend = child.backend ?? inheritedBackend;
    const persistence = await resolveAgentPersistence(child, runtime.environment ?? {});
    const nested = await createSubagents(
      child.subagents ?? [],
      model,
      backend,
      runtime,
      options,
      groups,
      deepagents,
      limitMiddleware,
    );
    subagents.push({
      name: child.id,
      description: child.description ?? child.title ?? child.id,
      runnable: deepagents.createDeepAgent({
        ...common,
        ...persistence,
        subagents: nested,
        ...(child.skills === undefined ? {} : { skills: [...child.skills] }),
        ...(child.memory === undefined ? {} : { memory: [...child.memory] }),
        ...(backend === undefined ? {} : { backend }),
        ...(child.interruptOn === undefined ? {} : { interruptOn: child.interruptOn }),
      } as never),
    });
  }
  return subagents;
}

function createTools(
  runtime: RuntimeOptions,
  options: Omit<Parameters<typeof createNativeAgent>[0], "runtime">,
  agent: AgentDescriptor<string, unknown, unknown>,
): NativeTools {
  return createNativeTools(
    { ...runtime, agent },
    options.signal,
    options.maxOutputBytes,
    options.invocationId,
    options.traceId,
  );
}

async function childModel(
  child: AgentDescriptor<string, unknown, unknown>,
  inherited: string | import("@langchain/core/language_models/base").LanguageModelLike,
  runtime: RuntimeOptions,
) {
  if (child.model === undefined) return inherited;
  return (
    await resolveRuntimeModel({
      model: child.model,
      registry: runtime.modelRegistry,
      environment: runtime.environment ?? {},
    })
  ).model;
}

function responseFormat(schema: StandardSchemaV1) {
  const projection = getJsonSchema(schema);
  if (!projection.ok) {
    throw new AgentRuntimeError("RELKIT_SCHEMA_UNAVAILABLE", "Agent output schema is unavailable");
  }
  return toolStrategy(
    {
      title: "relkit_output",
      type: "object",
      properties: { value: projection.schema },
      required: ["value"],
      additionalProperties: false,
    },
    { handleError: false },
  );
}
