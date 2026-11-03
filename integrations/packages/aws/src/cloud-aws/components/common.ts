import { createHash } from "node:crypto";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export type RelkitTags = pulumi.Input<Record<string, pulumi.Input<string>>>;

export interface RelkitComponentArgs {
  readonly appId?: pulumi.Input<string>;
  readonly stackName?: pulumi.Input<string>;
  readonly graphHash?: pulumi.Input<string>;
  readonly region?: pulumi.Input<string>;
  readonly tags?: RelkitTags;
}

export interface RelkitEnvironmentVariable {
  readonly name: string;
  readonly value: pulumi.Input<string>;
}

export interface RelkitSecretVariable {
  readonly name: string;
  readonly valueFrom: pulumi.Input<string>;
}

export type RelkitEnvironmentInput =
  readonly RelkitEnvironmentVariable[] | Readonly<Record<string, pulumi.Input<string>>>;
export type RelkitSecretInput =
  readonly RelkitSecretVariable[] | Readonly<Record<string, pulumi.Input<string>>>;

export const DEFAULT_SERVICE_PORT = 3000;
export const DEFAULT_LIVENESS_PATH = "/_relkit/v1/health/live";
export const DEFAULT_READINESS_PATH = "/_relkit/v1/health/ready";

export function resourceName(
  name: string,
  kind: string,
  args: RelkitComponentArgs,
  maxLength = 255,
): string {
  const appId = typeof args.appId === "string" ? args.appId : name;
  const stack = typeof args.stackName === "string" ? args.stackName : pulumi.getStack();
  const normalized = [stack, appId, kind]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, maxLength).replace(/-+$/, "") || "relkit";
}

export function tagsFor(
  name: string,
  args: RelkitComponentArgs,
): pulumi.Output<Record<string, string>> {
  return pulumi
    .all({
      custom: args.tags ?? {},
      app: args.appId ?? name,
      stack: args.stackName ?? pulumi.getStack(),
      graphHash: args.graphHash ?? "unknown",
    })
    .apply(({ custom, app, stack, graphHash }): Record<string, string> => ({
      ...(custom as Record<string, string>),
      app: String(app),
      stack: String(stack),
      graphHash: String(graphHash),
      "managed-by": "relkit",
    }));
}

export function awsRegion(args: RelkitComponentArgs): pulumi.Output<string> {
  if (typeof args.region === "string" && args.region.trim() === "")
    throw new TypeError("AWS region must not be empty.");
  return args.region === undefined ? aws.getRegionOutput().name : pulumi.output(args.region);
}

export function environmentEntries(
  input: RelkitEnvironmentInput | undefined,
): readonly RelkitEnvironmentVariable[] {
  if (input === undefined) return [];
  return Array.isArray(input)
    ? [...input].sort((left, right) => left.name.localeCompare(right.name))
    : Object.entries(input)
        .map(([name, value]) => ({ name, value }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function secretEntries(
  input: RelkitSecretInput | undefined,
): readonly RelkitSecretVariable[] {
  if (input === undefined) return [];
  return Array.isArray(input)
    ? [...input].sort((left, right) => left.name.localeCompare(right.name))
    : Object.entries(input)
        .map(([name, valueFrom]) => ({ name, valueFrom }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function validateMappings(
  environment: readonly RelkitEnvironmentVariable[],
  secrets: readonly RelkitSecretVariable[],
): void {
  const names = new Set<string>();
  for (const entry of environment) {
    validateEnvironmentName(entry.name);
    if (isSensitiveName(entry.name))
      throw new TypeError(`Sensitive environment variable "${entry.name}" must use secrets.`);
    if (!names.add(entry.name))
      throw new TypeError(`Duplicate environment variable "${entry.name}".`);
  }
  for (const entry of secrets) {
    validateEnvironmentName(entry.name);
    if (!names.add(entry.name))
      throw new TypeError(`Duplicate environment variable "${entry.name}".`);
    if (typeof entry.valueFrom === "string" && entry.valueFrom.trim() === "")
      throw new TypeError(`Secret mapping "${entry.name}" must not be empty.`);
  }
}

export function environmentName(prefix: string, id: string, suffix: string): string {
  const normalized = id
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `RELKIT_${prefix.toUpperCase()}_${normalized}_${suffix}`;
}

export function iamRoleName(componentName: string, suffix: string): string {
  return boundedAwsName(`${componentName}-${suffix}`, 64);
}

export function boundedAwsName(value: string, maxLength: number): string {
  const normalized =
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relkit";
  if (normalized.length <= maxLength) return normalized;
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 8);
  const prefix = normalized.slice(0, maxLength - hash.length - 1).replace(/-+$/g, "");
  return `${prefix}-${hash}`;
}

function validateEnvironmentName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new TypeError(`Invalid environment variable name "${name}".`);
}

function isSensitiveName(name: string): boolean {
  return /(?:api[-_]?key|password|secret|token|credential)/i.test(name);
}

export function validatePort(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535)
    throw new RangeError(`${name} must be an integer between 1 and 65535.`);
}

export function validatePath(value: string, name: string): void {
  if (!value.startsWith("/") || value.includes("'"))
    throw new TypeError(`${name} must be a single-quoted-safe absolute HTTP path.`);
}
