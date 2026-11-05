/**
 * The LangChain agent adapter. `langchain({ ... })` is the value an agent's `runtime` field holds;
 * its options carry LangChain-native models, middleware, tools, persistence and DeepAgents
 * capabilities, and any of them ties the agent to this adapter.
 */
import { defineAgentRuntime, type AgentRuntimeAdapter } from "relkit/agent-adapters";
import type { AgentClientPolicy } from "relkit/agents/agent-client";
import type { StandardSchemaV1 } from "relkit/schema";
import { prepareAgentDescriptor } from "./define-agent-build.js";
import { copyAgentMiddleware, middlewareStateKeys } from "./define-agent-native.js";
import type {
  AgentClientStateKey,
  AgentMiddleware,
  AgentModel,
  AgentTool,
} from "./define-agent-native.types.js";
import type { DeepAgentCapabilities } from "./define-agent-deep.types.js";
import type { AgentClientContractMetadata } from "./client-contract-metadata.js";
import type { DefineAgentOptions } from "./define-agent.types.js";

/** LangChain-native options accepted by `langchain({ ... })`. @experimental */
export interface LangchainAgentOptions<
  Middleware extends readonly AgentMiddleware[] = readonly AgentMiddleware[],
  Tools extends readonly AgentTool[] = readonly AgentTool[],
> extends DeepAgentCapabilities {
  /** A LangChain model or model factory; omitted resolves the agent's model profile. */
  readonly model?: AgentModel;
  readonly middleware?: Middleware;
  /** LangChain tools added after the agent's RelKit tools. */
  readonly tools?: Tools;
}

/** Descriptor fields the LangChain adapter adds to an agent. @experimental */
export type LangchainNativeFields<Middleware extends readonly AgentMiddleware[]> = {
  readonly model?: AgentModel;
  readonly tools: readonly AgentTool[];
  readonly middleware: Middleware;
  readonly client?: AgentClientPolicy<(...args: any[]) => unknown, AgentClientStateKey<Middleware>>;
  readonly clientContract: AgentClientContractMetadata;
} & DeepAgentCapabilities;

/** Value returned by `langchain({ ... })`. @experimental */
export type LangchainRuntime<
  Middleware extends readonly AgentMiddleware[] = readonly [],
  Tools extends readonly AgentTool[] = readonly [],
> = AgentRuntimeAdapter<
  "langchain",
  LangchainAgentOptions<Middleware, Tools>,
  LangchainNativeFields<Middleware>,
  AgentClientStateKey<Middleware>
>;

const NATIVE_KEYS = [
  "model",
  "middleware",
  "tools",
  "subagents",
  "skills",
  "memory",
  "backend",
  "checkpointer",
  "store",
  "interruptOn",
] as const;

/**
 * Selects LangChain to execute an agent.
 * @param options - LangChain-native extras; every one of them ties the agent to this adapter.
 * @returns The adapter value for `defineAgent({ runtime })`.
 * @example
 * ```ts
 * import { langchain } from "@relkit/langchain";
 * import { defineAgent } from "relkit/agents";
 * import { z } from "relkit/schema";
 *
 * const support = defineAgent({
 *   id: "support",
 *   runtime: langchain(),
 *   model: "default",
 *   input: z.object({ message: z.string() }),
 *   output: z.object({ answer: z.string() }),
 *   instructions: "Reply briefly.",
 *   tools: [],
 *   limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 30_000 },
 * });
 * void support;
 * ```
 * @category Agents
 * @since 0.9.0
 * @experimental
 */
export function langchain<
  const Middleware extends readonly AgentMiddleware[] = readonly [],
  const Tools extends readonly AgentTool[] = readonly [],
>(options: LangchainAgentOptions<Middleware, Tools> = {}): LangchainRuntime<Middleware, Tools> {
  if (options === null || typeof options !== "object") {
    throw new TypeError("langchain() options must be an object");
  }
  const middleware = copyAgentMiddleware(options.middleware ?? ([] as unknown as Middleware));
  const native = NATIVE_KEYS.filter((key) => options[key] !== undefined);
  return defineAgentRuntime<
    "langchain",
    LangchainAgentOptions<Middleware, Tools>,
    LangchainNativeFields<Middleware>,
    AgentClientStateKey<Middleware>
  >({
    adapterId: "langchain",
    integrationId: "langchain",
    options,
    nativeOptions: native,
    clientStateKeys: [...middlewareStateKeys(middleware)],
    extend: ({ id, options: authored }) => {
      const portable = authored as unknown as DefineAgentOptions<
        string,
        StandardSchemaV1,
        StandardSchemaV1,
        Middleware,
        readonly AgentTool[]
      >;
      const descriptor = prepareAgentDescriptor({
        ...portable,
        ...(options.model === undefined ? {} : { model: options.model }),
        tools: [...(portable.tools ?? []), ...(options.tools ?? [])],
        middleware,
        ...deepOptions(options),
      })(id);
      const {
        kind: _kind,
        id: _id,
        ref: _ref,
        ...fields
      } = descriptor as unknown as Record<string, unknown>;
      return fields;
    },
  });
}

function deepOptions(options: DeepAgentCapabilities): DeepAgentCapabilities {
  const keys = ["subagents", "skills", "memory", "backend", "checkpointer", "store", "interruptOn"];
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = options[key as keyof DeepAgentCapabilities];
      return value === undefined ? [] : [[key, value]];
    }),
  ) as DeepAgentCapabilities;
}
