import type { ProviderCapability, ProviderSet } from "@zsys/app";

export type AwsRecord = Readonly<Record<string, unknown>>;

export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export function profileConfig(
  providerSet: ProviderSet<"aws">,
  capability: ProviderCapability,
  profile: string,
  values: Readonly<Record<string, unknown>> | undefined,
): AwsRecord {
  const configured = record(providerSet.metadata.configuration[capability]);
  const profileValue = configured?.[profile];
  const resolved = resolveValue(profileValue, values);
  return record(resolved) ?? {};
}

export function configuredProfiles(
  providerSet: ProviderSet<"aws">,
  capability: ProviderCapability,
): readonly string[] {
  const configured = record(providerSet.metadata.configuration[capability]);
  return configured === undefined
    ? []
    : Object.keys(configured).sort((left, right) => left.localeCompare(right));
}

export function resolveValue(
  value: unknown,
  values: Readonly<Record<string, unknown>> | undefined,
): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, values));
  const object = record(value);
  if (object === undefined) return value;
  if (object.kind === "env-ref" && typeof object.name === "string") {
    return values?.[object.name] ?? process.env[object.name];
  }
  if (object.kind === "sensitive-configuration") return undefined;
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, resolveValue(item, values)]),
  );
}

export function text(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is invalid`);
  return value.trim();
}

export function credentials(
  values: Readonly<Record<string, unknown>> | undefined,
): AwsCredentials | undefined {
  const read = (name: string): string | undefined => {
    const value = values?.[name] ?? process.env[name];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const accessKeyId = read("AWS_ACCESS_KEY_ID");
  const secretAccessKey = read("AWS_SECRET_ACCESS_KEY");
  if (accessKeyId === undefined || secretAccessKey === undefined) return undefined;
  const sessionToken = read("AWS_SESSION_TOKEN");
  return { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) };
}

export function record(value: unknown): AwsRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AwsRecord)
    : undefined;
}
