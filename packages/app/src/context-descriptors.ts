import { isEnvRef, type EnvRef } from "@relkit/config";
import {
  createDescriptorBase,
  deepFreeze,
  type DescriptorBase,
  type JsonValue,
  type MaybePromise,
} from "@relkit/contracts";
import { createUnboundIdentity, type PublicLogger } from "@relkit/invocation";

export interface ContextResolverOptions {
  readonly env: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly log: PublicLogger;
}

export type ConstantResolver<Value = unknown> = (
  options: ContextResolverOptions,
) => MaybePromise<Value>;
export type ConstantValue = JsonValue | EnvRef | ConstantResolver;
export type ConstantsShape = Readonly<Record<string, ConstantValue>>;

export interface ConstantsDescriptor<
  Values extends ConstantsShape = ConstantsShape,
> extends DescriptorBase<"constants", string> {
  readonly values: Values;
}

export interface PromptDescriptor<Value extends PromptValue = PromptValue> extends DescriptorBase<
  "prompt",
  string
> {
  readonly value: Value;
}

export type PromptValue = string | readonly string[];

export type ResolvedConstants<Descriptor extends ConstantsDescriptor> = {
  readonly [Key in keyof Descriptor["values"]]: ResolveConstant<Descriptor["values"][Key]>;
};

export type ResolvedPrompt<Descriptor extends PromptDescriptor> = Descriptor["value"];

type ResolveConstant<Value> = Value extends (...args: never[]) => infer Result
  ? Awaited<Result>
  : Value extends EnvRef<string, infer Result>
    ? Result
    : Value;

export function defineConstants<const Values extends ConstantsShape>(
  values: Values,
): ConstantsDescriptor<Values> {
  if (!isRecord(values)) throw new TypeError("Constants must be an object map");
  for (const [key, value] of Object.entries(values)) {
    if (key.trim() === "" || (!isEnvRef(value) && typeof value !== "function" && !isJson(value))) {
      throw new TypeError(`Constant "${key}" is invalid`);
    }
  }
  return deepFreeze({
    ...createDescriptorBase("constants", createUnboundIdentity()),
    values: { ...values },
  }) as ConstantsDescriptor<Values>;
}

export function definePrompt<const Value extends PromptValue>(
  value: Value,
): PromptDescriptor<Value> {
  const values = typeof value === "string" ? [value] : value;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.some((entry) => entry.trim() === "")
  ) {
    throw new TypeError("A prompt must contain nonempty text");
  }
  return deepFreeze({
    ...createDescriptorBase("prompt", createUnboundIdentity()),
    value: Array.isArray(value) ? [...value] : value,
  }) as PromptDescriptor<Value>;
}

function isJson(value: unknown): value is JsonValue {
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
