/**
 * Binds a model profile in `relkit.config.ts` to a LangChain model name. Agents reference the
 * profile (`model: "default"`), so rebinding it changes their model without code changes.
 */
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  type ProviderAdapter,
} from "relkit/provider";

const model = defineProviderCapability("model");
const integration = defineIntegrationReference("langchain");
const connectionContract = defineConnectionContract({ model: { authoredValue: "fixed" } });

/** Options for `langchainModel`. @experimental */
export interface LangchainModelOptions {
  /** Provider-qualified model name that LangChain's `initChatModel` accepts, such as `openai:gpt-5`. */
  readonly model: string;
}

/** Model provider value bound to a profile. @experimental */
export type LangchainModelAdapter = ProviderAdapter<typeof model, "langchain-model">;

/**
 * Binds a model profile to a LangChain model.
 * @param options - The provider-qualified model name.
 * @returns A `model` provider for `defineApp({ model: { default: ... } })`.
 * @example
 * ```ts
 * import { langchainModel } from "@relkit/langchain";
 * const models = { default: langchainModel({ model: "openai:gpt-5" }) };
 * void models;
 * ```
 * @category Agents
 * @since 0.9.0
 * @experimental
 */
export function langchainModel(options: LangchainModelOptions): LangchainModelAdapter {
  if (typeof options?.model !== "string" || !/^[\w.-]+:[\w./-]+$/u.test(options.model)) {
    throw new TypeError(
      'langchainModel() needs a provider-qualified model name, such as "openai:gpt-5"',
    );
  }
  return defineProviderAdapter({
    integration,
    capability: model,
    adapterId: "langchain-model",
    connectionContract,
    connection: { model: options.model },
    behavior: defineProviderBehavior({}),
    features: [],
  }) as LangchainModelAdapter;
}
