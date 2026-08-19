import {
  assertJsonValue,
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  type DescriptorBase,
  type DescriptorMetadata,
  type JsonValue,
} from "@zsys/contracts";
import { isEnvRef, type EnvDefinition, type EnvShape } from "@zsys/config";
import { copyProviderSets, isProviderSet, type ProviderSets } from "./providers.js";

export * from "./providers.js";

export type BodyCaptureMode = "off" | "development-redacted";

export interface BodyCaptureConfiguration {
  readonly mode: BodyCaptureMode;
  readonly maxBytes?: number;
  readonly redactKeys?: readonly string[];
}

export interface ObservabilityConfiguration {
  readonly bodyCapture?: BodyCaptureConfiguration;
  readonly [key: string]: unknown;
}

export type ApplicationDefaults = Readonly<Record<string, JsonValue>>;

export interface AppDescriptor<
  Id extends string,
  S extends EnvShape = EnvShape,
> extends DescriptorBase<"app", Id> {
  readonly env: EnvDefinition<S>;
  readonly providers: ProviderSets;
  readonly observability?: ObservabilityConfiguration;
  readonly defaults?: ApplicationDefaults;
}

export interface DefineAppOptions<
  Id extends string,
  S extends EnvShape,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly env: EnvDefinition<S>;
  readonly providers: ProviderSets;
  readonly observability?: ObservabilityConfiguration;
  readonly defaults?: ApplicationDefaults;
}

/** Defines the application boundary, including its environment and provider capabilities. */
export function defineApp<const Id extends string, const S extends EnvShape>(
  options: DefineAppOptions<Id, S>,
): AppDescriptor<Id, S> {
  if (!isRecord(options) || !isEnvDefinition(options.env)) {
    throw new TypeError("App options require an environment definition");
  }
  const observability = copyObservability(options.observability);
  const defaults = copyDefaults(options.defaults);
  const base = createDescriptorBase("app", options.id, options);
  return deepFreeze({
    ...base,
    env: options.env,
    providers: copyProviderSets(options.providers),
    ...(observability === undefined ? {} : { observability }),
    ...(defaults === undefined ? {} : { defaults }),
  }) as AppDescriptor<Id, S>;
}

export function isAppDescriptor(value: unknown): value is AppDescriptor<string> {
  if (!isRecord(value) || !isDescriptor(value, "app")) return false;
  const descriptor = value as AppDescriptor<string>;
  return isEnvDefinition(descriptor.env) && isProviderSets(descriptor.providers);
}

export function assertAppDescriptor(value: unknown): asserts value is AppDescriptor<string> {
  if (!isAppDescriptor(value)) throw new TypeError("Invalid app descriptor");
}

function copyObservability(
  value: ObservabilityConfiguration | undefined,
): ObservabilityConfiguration | undefined {
  if (value === undefined) return undefined;
  assertJsonValue(value);
  const copy = deepFreeze(cloneJson(value as JsonValue)) as ObservabilityConfiguration;
  const capture = copy.bodyCapture;
  if (capture !== undefined) {
    if (capture.mode !== "off" && capture.mode !== "development-redacted") {
      throw new TypeError("observability.bodyCapture.mode is invalid");
    }
    if (capture.maxBytes !== undefined && !isPositiveInteger(capture.maxBytes)) {
      throw new TypeError("observability.bodyCapture.maxBytes must be positive");
    }
    if (capture.mode === "development-redacted" && capture.maxBytes === undefined) {
      throw new TypeError("development-redacted body capture requires maxBytes");
    }
    if (capture.redactKeys !== undefined && !uniqueTextList(capture.redactKeys)) {
      throw new TypeError("observability.bodyCapture.redactKeys must be unique text");
    }
  }
  return copy;
}

function copyDefaults(value: ApplicationDefaults | undefined): ApplicationDefaults | undefined {
  if (value === undefined) return undefined;
  assertJsonValue(value);
  return deepFreeze(cloneJson(value as JsonValue)) as ApplicationDefaults;
}

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
  }
  return value;
}

function isEnvDefinition(value: unknown): value is EnvDefinition<EnvShape> {
  if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape)) return false;
  return Object.entries(value.shape).every(([name, builder]) => {
    const reference = value[name];
    return (
      isRecord(builder) &&
      builder.kind === "env-builder" &&
      typeof builder.parse === "function" &&
      typeof builder.getDefault === "function" &&
      isEnvRef(reference) &&
      reference.name === name
    );
  });
}

function isProviderSets(value: unknown): value is ProviderSets {
  if (!isRecord(value)) return false;
  return ["development", "test", "production"].every((name) => {
    const provider = value[name];
    return isProviderSet(provider);
  });
}

function uniqueTextList(value: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((item) => item.trim() !== "")
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
