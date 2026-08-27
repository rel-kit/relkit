import type { EnvRef } from "@relkit/config";
import type { JsonPrimitive } from "@relkit/contracts";
import type { ModelProviders } from "./model-providers.js";
import {
  copyProviderTopology,
  createAdapter,
  createBinding,
  isProviderBinding,
  isProviderTopology,
  providerEnvironment,
} from "./providers-validation.js";

export type { ModelProviderOptions, ModelProviders } from "./model-providers.js";

export const PROVIDER_CAPABILITIES = Object.freeze([
  "buckets",
  "cache",
  "jobs",
  "events",
  "models",
  "observability",
] as const);

export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number];
export type ProviderOwnership = "external" | "managed";
export type ProviderValue =
  JsonPrimitive | EnvRef | readonly ProviderValue[] | { readonly [key: string]: ProviderValue };
export type ProviderConfig = Readonly<Record<string, ProviderValue>>;

export interface ProviderEnvironmentReference {
  readonly name: string;
  readonly type: string;
  readonly sensitive: boolean;
}

export interface ProviderAdapter<
  Capability extends ProviderCapability = ProviderCapability,
  Name extends string = string,
> {
  readonly kind: "provider-adapter";
  readonly capability: Capability;
  readonly adapter: Name;
  readonly configuration: ProviderConfig;
  readonly environment: readonly ProviderEnvironmentReference[];
}

export interface ProviderBinding<
  Capability extends ProviderCapability = ProviderCapability,
  Name extends string = string,
> {
  readonly kind: "provider-binding";
  readonly ownership: ProviderOwnership;
  readonly adapter: ProviderAdapter<Capability, Name>;
}

export type CapabilityBindings<C extends ProviderCapability> = Readonly<
  Record<string, ProviderBinding<C>>
>;

export interface ProviderTopology {
  readonly buckets?: CapabilityBindings<"buckets">;
  readonly cache?: CapabilityBindings<"cache">;
  readonly jobs?: CapabilityBindings<"jobs">;
  readonly events?: CapabilityBindings<"events">;
  readonly models?: CapabilityBindings<"models">;
  readonly observability?: CapabilityBindings<"observability">;
}

export interface S3Options {
  readonly endpoint: string | URL | EnvRef;
  readonly bucketName: string | EnvRef;
  readonly region: string | EnvRef;
  readonly credentials?: {
    readonly accessKeyId?: EnvRef;
    readonly secretAccessKey?: EnvRef;
    readonly sessionToken?: EnvRef;
  };
  readonly forcePathStyle?: boolean | EnvRef;
}

export interface RedisOptions {
  readonly url: EnvRef;
}

export interface AwsProtocolOptions {
  readonly region: string | EnvRef;
  readonly endpoint?: string | URL | EnvRef;
  readonly credentials?: S3Options["credentials"];
}

export interface SqsOptions extends AwsProtocolOptions {
  readonly queueUrl: string | URL | EnvRef;
}

export interface EventBridgeOptions extends AwsProtocolOptions {
  readonly busName: string | EnvRef;
  readonly source?: string | EnvRef;
}

export interface OtlpOptions {
  readonly endpoint: string | URL | EnvRef;
  readonly headers?: Readonly<Record<string, EnvRef>>;
}

export function s3(options: S3Options): ProviderAdapter<"buckets", "s3"> {
  return createAdapter("buckets", "s3", options, [
    "credentials.accessKeyId",
    "credentials.secretAccessKey",
    "credentials.sessionToken",
  ]);
}

export function redis(options: RedisOptions): ProviderAdapter<"cache", "redis"> {
  return createAdapter("cache", "redis", options, ["url"]);
}

export function sqs(options: SqsOptions): ProviderAdapter<"jobs", "sqs"> {
  return createAdapter("jobs", "sqs", options, [
    "credentials.accessKeyId",
    "credentials.secretAccessKey",
    "credentials.sessionToken",
  ]);
}

export function eventBridge(options: EventBridgeOptions): ProviderAdapter<"events", "eventbridge"> {
  return createAdapter("events", "eventbridge", options, [
    "credentials.accessKeyId",
    "credentials.secretAccessKey",
    "credentials.sessionToken",
  ]);
}

export function aiSdk(options: ModelProviders): ProviderAdapter<"models", "ai-sdk"> {
  return createAdapter("models", "ai-sdk", options, [], true);
}

export function otlp(options: OtlpOptions): ProviderAdapter<"observability", "otlp"> {
  return createAdapter("observability", "otlp", options, [], true);
}

export function cloudWatch(
  options: Pick<AwsProtocolOptions, "region">,
): ProviderAdapter<"observability", "cloudwatch"> {
  return createAdapter("observability", "cloudwatch", options, []);
}

export function external<C extends ProviderCapability, N extends string>(
  adapter: ProviderAdapter<C, N>,
): ProviderBinding<C, N> {
  return createBinding("external", adapter);
}

export function managed<C extends ProviderCapability, N extends string>(
  adapter: ProviderAdapter<C, N>,
): ProviderBinding<C, N> {
  return createBinding("managed", adapter);
}

export { copyProviderTopology, isProviderBinding, isProviderTopology, providerEnvironment };
