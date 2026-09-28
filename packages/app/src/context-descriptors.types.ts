import type { EnvRef } from "@relkit/config";
import type { DescriptorBase, JsonValue, MaybePromise } from "@relkit/contracts";
import type { PublicLogger } from "@relkit/invocation";

/** Inputs available to a dynamic constant resolver.
 * @example const options: ContextResolverOptions = { env: {}, signal, log };
 */
export interface ContextResolverOptions {
  readonly env: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly log: PublicLogger;
}

/** Computes one constant for each context resolution.
 * @example const region: ConstantResolver<string> = ({ env }) => String(env.REGION);
 */
export type ConstantResolver<Value = unknown> = (
  options: ContextResolverOptions,
) => MaybePromise<Value>;

/** Accepted static, environment, or dynamic constant input.
 * @example const value: ConstantValue = "eu-west-1";
 */
export type ConstantValue = JsonValue | EnvRef | ConstantResolver;

/** Named constant inputs for one descriptor.
 * @example const values: ConstantsShape = { region: "eu-west-1" };
 */
export type ConstantsShape = Readonly<Record<string, ConstantValue>>;

/** Immutable descriptor for one set of constants.
 * @example const descriptor: ConstantsDescriptor = defineConstants({ region: "eu" });
 */
export interface ConstantsDescriptor<
  Values extends ConstantsShape = ConstantsShape,
> extends DescriptorBase<"constants", string> {
  readonly values: Values;
}

/** Prompt text or an ordered list of prompt fragments.
 * @example const prompt: PromptValue = ["Be concise.", "Use tools."];
 */
export type PromptValue = string | readonly string[];

/** Immutable descriptor for one prompt.
 * @example const descriptor: PromptDescriptor = definePrompt("Be concise.");
 */
export interface PromptDescriptor<Value extends PromptValue = PromptValue> extends DescriptorBase<
  "prompt",
  string
> {
  readonly value: Value;
}

/** Optional stable identity for a context descriptor.
 * @example const options: ContextDescriptorOptions = { id: "support.prompt" };
 */
export interface ContextDescriptorOptions {
  readonly id?: string;
}

/** Resolved values inferred from a constants descriptor.
 * @example type Values = ResolvedConstants<typeof constants>;
 */
export type ResolvedConstants<Descriptor extends ConstantsDescriptor> = {
  readonly [Key in keyof Descriptor["values"]]: ResolveConstant<Descriptor["values"][Key]>;
};

/** Resolved prompt text inferred from a prompt descriptor.
 * @example type Text = ResolvedPrompt<typeof prompt>;
 */
export type ResolvedPrompt<Descriptor extends PromptDescriptor> = Descriptor["value"];

type ResolveConstant<Value> = Value extends (...args: never[]) => infer Result
  ? Awaited<Result>
  : Value extends EnvRef<string, infer Result>
    ? Result
    : Value;
