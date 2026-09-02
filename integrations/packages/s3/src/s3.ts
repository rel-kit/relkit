import {
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  type BindingValueRef,
  type ProviderAdapter,
  type ProviderBehavior,
  type ProviderConnectionValues,
} from "@relkit/provider";

const bucket = defineProviderCapability("bucket");
const integration = defineIntegrationReference("s3");
const signedReadUrl = defineProviderFeature(bucket, "signedReadUrl");
const signedWriteUrl = defineProviderFeature(bucket, "signedWriteUrl");
const connectionContract = defineConnectionContract({
  endpoint: { authoredValue: "fallback" },
  bucketName: { authoredValue: "fallback" },
  region: { authoredValue: "fallback" },
  accessKeyId: { required: false, sensitive: true, authoredValue: "fallback" },
  secretAccessKey: { required: false, sensitive: true, authoredValue: "fallback" },
  sessionToken: { required: false, sensitive: true, authoredValue: "fallback" },
});
const localRecipe = defineLocalRecipeReference(integration, "minio-docker", 1);
const optionKeys = new Set([
  "endpoint",
  "bucketName",
  "region",
  "credentials",
  "forcePathStyle",
  "signedUrlTtlSeconds",
]);
const credentialKeys = new Set(["accessKeyId", "secretAccessKey", "sessionToken"]);

type TextReference = BindingValueRef<string, string, "string">;
type UrlReference = BindingValueRef<string, URL, "url">;
type SecretReference = BindingValueRef<string, string, "secret-string">;

export interface S3CredentialsOptions {
  readonly accessKeyId: SecretReference;
  readonly secretAccessKey: SecretReference;
  readonly sessionToken?: SecretReference;
}

export interface S3Options {
  readonly endpoint?: string | URL | TextReference | UrlReference;
  readonly bucketName?: string | TextReference;
  readonly region?: string | TextReference;
  readonly credentials?: S3CredentialsOptions;
  readonly forcePathStyle?: boolean;
  readonly signedUrlTtlSeconds?: number;
}

export type S3Behavior = Readonly<{
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
}>;

export type S3Adapter = ProviderAdapter<
  typeof bucket,
  "s3",
  ProviderConnectionValues,
  ProviderBehavior<S3Behavior>
>;

/**
 * Defines an S3-compatible bucket adapter. Omit connection fields for local or infrastructure use.
 *
 * @example
 * ```ts
 * import { s3 } from "@relkit/s3";
 * const assets = s3({ endpoint: "https://s3.example.com", bucketName: "assets", region: "us-east-1" });
 * ```
 * @category Integrations
 * @since 0.2.0
 */
export function s3(options: S3Options = {}): S3Adapter {
  assertOptions(options);
  return defineProviderAdapter({
    integration,
    capability: bucket,
    adapterId: "s3",
    connectionContract,
    connection: connection(options),
    behavior: defineProviderBehavior({
      forcePathStyle: options.forcePathStyle ?? true,
      signedUrlTtlSeconds: options.signedUrlTtlSeconds ?? 900,
    }),
    features: [signedReadUrl, signedWriteUrl],
    localRecipe,
  });
}

function connection(options: S3Options): ProviderConnectionValues {
  const credentials = options.credentials;
  return {
    ...(options.endpoint === undefined ? {} : { endpoint: endpointValue(options.endpoint) }),
    ...(options.bucketName === undefined ? {} : { bucketName: options.bucketName }),
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(credentials === undefined
      ? {}
      : {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          ...(credentials.sessionToken === undefined
            ? {}
            : { sessionToken: credentials.sessionToken }),
        }),
  };
}

function assertOptions(options: S3Options): void {
  const value: unknown = options;
  if (!isRecord(value)) throw new TypeError("S3 options must be an object");
  for (const key of Object.keys(options))
    if (!optionKeys.has(key)) throw new TypeError(`Unknown S3 option "${key}"`);
  assertEndpoint(options.endpoint);
  assertTextValue(options.bucketName, "bucketName");
  assertTextValue(options.region, "region");
  assertCredentials(options.credentials);
  if (options.forcePathStyle !== undefined && typeof options.forcePathStyle !== "boolean")
    throw new TypeError("S3 forcePathStyle must be a boolean");
  const ttl = options.signedUrlTtlSeconds;
  if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 604_800))
    throw new RangeError("S3 signedUrlTtlSeconds must be between 1 and 604800");
}

function assertEndpoint(value: S3Options["endpoint"]): void {
  if (value === undefined) return;
  if (isBindingValueRef(value)) {
    if ((value.type !== "string" && value.type !== "url") || value.sensitive)
      throw new TypeError("S3 endpoint must be an HTTP URL or a named text/URL binding value");
    return;
  }
  const url = value instanceof URL ? value : new URL(assertText(value, "endpoint"));
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("S3 endpoint must use http or https");
}

function assertTextValue(value: unknown, name: string): void {
  if (value === undefined) return;
  if (isBindingValueRef(value)) {
    if (value.type !== "string" || value.sensitive)
      throw new TypeError(`S3 ${name} must be text or a named text binding value`);
    return;
  }
  assertText(value, name);
}

function assertCredentials(value: S3CredentialsOptions | undefined): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new TypeError("S3 credentials must be an object");
  for (const key of Object.keys(value))
    if (!credentialKeys.has(key)) throw new TypeError(`Unknown S3 credential "${key}"`);
  for (const name of ["accessKeyId", "secretAccessKey"] as const)
    if (!Object.prototype.hasOwnProperty.call(value, name))
      throw new TypeError(`S3 credentials.${name} must be a named secret binding value`);
  for (const [name, reference] of Object.entries(value))
    if (!isBindingValueRef(reference) || reference.type !== "secret-string" || !reference.sensitive)
      throw new TypeError(`S3 credentials.${name} must be a named secret binding value`);
}

function endpointValue(value: NonNullable<S3Options["endpoint"]>) {
  return value instanceof URL ? value.toString() : value;
}

function assertText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`S3 ${name} must be non-empty text`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
