import { isEnvRef } from "@relkit/config";
import type { PublicLogger } from "@relkit/invocation";
import type {
  ConstantResolver,
  ConstantsDescriptor,
  PromptDescriptor,
  PromptValue,
} from "./context-descriptors.js";

export interface ApplicationContextResolver {
  readonly resolve: (options: {
    readonly signal: AbortSignal;
    readonly log: PublicLogger;
  }) => Promise<{
    readonly constants: Readonly<Record<string, unknown>>;
    readonly prompts: Readonly<Record<string, PromptValue>>;
  }>;
}

export function createApplicationContextResolver(options: {
  readonly constants?: Readonly<Record<string, ConstantsDescriptor>>;
  readonly prompts?: Readonly<Record<string, PromptDescriptor>>;
  readonly env: Readonly<Record<string, unknown>>;
}): ApplicationContextResolver {
  const staticValues: Record<string, unknown> = {};
  const resolvers: [string, ConstantResolver][] = [];
  for (const descriptor of Object.values(options.constants ?? {})) {
    for (const [key, value] of Object.entries(descriptor.values)) {
      if (Object.hasOwn(staticValues, key) || resolvers.some(([name]) => name === key)) {
        throw new TypeError(`Constant "${key}" is registered more than once`);
      }
      if (typeof value === "function") resolvers.push([key, value]);
      else staticValues[key] = isEnvRef(value) ? options.env[value.name] : value;
    }
  }
  const prompts = Object.freeze(
    Object.fromEntries(
      Object.entries(options.prompts ?? {}).map(([key, descriptor]) => [key, descriptor.value]),
    ),
  );
  return Object.freeze({
    async resolve(context: { readonly signal: AbortSignal; readonly log: PublicLogger }) {
      const dynamic = await Promise.all(
        resolvers.map(
          async ([key, resolver]) =>
            [
              key,
              await resolver({ env: options.env, signal: context.signal, log: context.log }),
            ] as const,
        ),
      );
      return {
        constants: Object.freeze({ ...staticValues, ...Object.fromEntries(dynamic) }),
        prompts,
      };
    },
  });
}
