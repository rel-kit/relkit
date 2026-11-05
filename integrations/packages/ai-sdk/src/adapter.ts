/**
 * The Vercel AI SDK agent adapter. `aiSdk({ ... })` is the value an agent's `runtime` field holds; it
 * imports nothing from the AI SDK, so declaring an agent loads no SDK.
 */
import { defineAgentRuntime, type AgentRuntimeAdapter } from "relkit/agent-adapters";

/** AI SDK-native options accepted by `aiSdk({ ... })`. @experimental */
export interface AiSdkAgentOptions {
  /** An AI SDK language model; omitted resolves the agent's model profile. Ties the agent to this adapter. */
  readonly model?: object;
}

/** Descriptor fields the AI SDK adapter adds to an agent. @experimental */
export interface AiSdkNativeFields {
  readonly model?: object | string;
}

/** Value returned by `aiSdk({ ... })`. @experimental */
export type AiSdkRuntime = AgentRuntimeAdapter<"ai-sdk", AiSdkAgentOptions, AiSdkNativeFields>;

/**
 * Selects the Vercel AI SDK to execute an agent.
 * @param options - AI SDK-native extras; each one ties the agent to this adapter.
 * @returns The adapter value for `defineAgent({ runtime })`.
 * @example
 * ```ts
 * import { aiSdk } from "@relkit/ai-sdk";
 * import { defineAgent } from "relkit/agents";
 * import { z } from "relkit/schema";
 *
 * const support = defineAgent({
 *   id: "support",
 *   runtime: aiSdk(),
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
export function aiSdk(options: AiSdkAgentOptions = {}): AiSdkRuntime {
  if (options === null || typeof options !== "object") {
    throw new TypeError("aiSdk() options must be an object");
  }
  if (
    options.model !== undefined &&
    (options.model === null || typeof options.model !== "object")
  ) {
    throw new TypeError("aiSdk() model must be an AI SDK language model");
  }
  return defineAgentRuntime<"ai-sdk", AiSdkAgentOptions, AiSdkNativeFields>({
    adapterId: "ai-sdk",
    integrationId: "ai-sdk",
    options,
    nativeOptions: options.model === undefined ? [] : ["model"],
    extend: () => (options.model === undefined ? {} : { model: options.model }),
  });
}
