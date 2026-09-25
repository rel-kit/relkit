import type { EnvBuilderBase, EnvMetadata } from "./env.types.js";
import type { EnvIssue, EnvSource, ResolveEnvOptions } from "./resolve.types.js";

/** Check the declaration shape before reading field callbacks.
 * @param value - Candidate declaration.
 * @returns A stable message or undefined when valid.
 * @example definitionIssue(defineEnv({ MODE: env.string() }));
 */
export function definitionIssue(value: unknown): string | undefined {
  if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape)) {
    return "Expected an environment definition";
  }
  for (const builder of Object.values(value.shape)) {
    if (
      !isRecord(builder) ||
      builder.kind !== "env-builder" ||
      typeof builder.parse !== "function" ||
      typeof builder.getDefault !== "function" ||
      !isRecord(builder.metadata)
    )
      return "Environment definitions must contain env builders";
  }
  return undefined;
}

/** Check an explicit environment name and source map.
 * @param options - Resolution options to validate.
 * @returns A stable message or undefined when valid.
 * @example optionsIssue({ environment: "test", source: {} });
 */
export function optionsIssue(options: ResolveEnvOptions): string | undefined {
  if (!isRecord(options) || typeof options.environment !== "string" || !options.environment) {
    return "Environment resolution requires an environment name";
  }
  if (!isRecord(options.source)) return "Environment source must be an object";
  for (const entry of Object.values(options.source)) {
    if (entry !== undefined && typeof entry !== "string") {
      return "Environment source values must be strings or undefined";
    }
  }
  return undefined;
}

/** Resolve one field while appending issues in declaration order.
 * @param name - Declared field name.
 * @param builder - Field parser and default provider.
 * @param source - Explicit raw values.
 * @param environment - Environment name.
 * @param values - Mutable result accumulator.
 * @param issues - Mutable ordered issue accumulator.
 * @returns Nothing; updates the provided accumulators.
 * @example resolveField("MODE", env.string(), { MODE: "test" }, "test", values, issues);
 */
export function resolveField(
  name: string,
  builder: EnvBuilderBase,
  source: EnvSource,
  environment: string,
  values: Record<string, unknown>,
  issues: EnvIssue[],
): void {
  const raw = Object.hasOwn(source, name) ? source[name] : undefined;
  if (raw !== undefined) {
    if (typeof raw !== "string")
      issues.push(invalidIssue(name, builder, "Expected a string value"));
    else parseValue(name, builder, raw, values, issues);
    return;
  }
  resolveMissing(name, builder, environment, values, issues);
}

function parseValue(
  name: string,
  builder: EnvBuilderBase,
  raw: string,
  values: Record<string, unknown>,
  issues: EnvIssue[],
): void {
  try {
    const value = builder.parse(raw);
    if (value === undefined) issues.push(invalidIssue(name, builder, "Parser returned no value"));
    else values[name] = freezeValue(value);
  } catch (cause) {
    const message = cause instanceof Error && cause.message ? cause.message : "Value is invalid";
    issues.push(invalidIssue(name, builder, message));
  }
}

function resolveMissing(
  name: string,
  builder: EnvBuilderBase,
  environment: string,
  values: Record<string, unknown>,
  issues: EnvIssue[],
): void {
  try {
    const defaultValue = builder.getDefault();
    if (defaultValue !== undefined) {
      values[name] = freezeValue(defaultValue);
      return;
    }
  } catch {
    issues.push(invalidIssue(name, builder, "Default value could not be produced"));
    return;
  }
  if (isRequired(builder.metadata, environment)) {
    issues.push({
      name,
      code: "missing",
      message: "Required value is missing",
      sensitive: builder.metadata.sensitive,
    });
  } else values[name] = undefined;
}

function invalidIssue(name: string, builder: EnvBuilderBase, message: string): EnvIssue {
  return {
    name,
    code: "invalid",
    message: builder.metadata.sensitive ? "Value is invalid" : message,
    sensitive: builder.metadata.sensitive,
  };
}

function isRequired(metadata: EnvMetadata, environment: string): boolean {
  return metadata.requiredIn.length > 0
    ? metadata.requiredIn.includes(environment)
    : !metadata.optional;
}

function freezeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeValue((value as Record<string, unknown>)[key]);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
