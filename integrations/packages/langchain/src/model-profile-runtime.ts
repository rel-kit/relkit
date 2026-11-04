/** Runtime registration of the LangChain model profile provider: resolves an agent's profile to its bound model. */
import type { RuntimeProviderContext, RuntimeProviderRegistration } from "relkit/provider";

/** Registry value an agent run reads its model from. @experimental */
export interface LangchainModelRegistry {
  /**
   * @param selector - The agent's `model` value; `profile:model` overrides the bound model name.
   * @returns The bound model identity and the name LangChain resolves.
   */
  readonly resolveModel: (selector?: string) => { readonly id: string; readonly model: string };
}

/**
 * Creates the registry for one bound profile.
 * @param context - Provider binding with the `model` connection value.
 * @returns The profile's model registry.
 * @example createLangchainModelRegistry(context).resolveModel("default");
 * @experimental
 */
export function createLangchainModelRegistry(
  context: Pick<RuntimeProviderContext, "connection" | "profile">,
): LangchainModelRegistry {
  const bound = context.connection.model;
  if (typeof bound !== "string") throw new TypeError("The model profile has no bound model");
  return Object.freeze({
    resolveModel: (selector?: string) => {
      const separator = selector?.indexOf(":") ?? -1;
      const override = separator < 0 ? "" : selector!.slice(separator + 1);
      const id = override === "" ? bound : `${bound.split(":", 1)[0]}:${override}`;
      return { id, model: id };
    },
  });
}

/** @experimental */
export const langchainModelRegistration: RuntimeProviderRegistration = Object.freeze({
  capability: "model",
  adapterId: "langchain-model",
  protocolVersion: 1,
  create: (context: RuntimeProviderContext) => ({ value: createLangchainModelRegistry(context) }),
});
