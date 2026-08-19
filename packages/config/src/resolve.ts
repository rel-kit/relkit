import type {
  EnvBuilderBase,
  EnvDefinition,
  EnvMetadata,
  EnvShape,
  InferEnvValues,
} from "./env-types.js";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface ResolveEnvOptions {
  readonly environment: string;
  readonly source: EnvSource;
}

export interface EnvIssue {
  readonly name: string;
  readonly code: "missing" | "invalid";
  readonly message: string;
  readonly sensitive: boolean;
}

export class EnvResolutionError extends Error {
  readonly name = "EnvResolutionError";
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    super(issues.map((issue) => `${issue.name}: ${issue.message}`).join("; "));
    this.issues = Object.freeze([...issues]);
  }
}

export type ResolvedEnv<S extends EnvShape> = Readonly<InferEnvValues<S>>;

export interface EnvProjection extends EnvMetadata {
  readonly name: string;
}

/** Resolves a value-free environment definition against explicit runtime input. */
export function resolveEnv<S extends EnvShape>(
  definition: EnvDefinition<S>,
  options: ResolveEnvOptions,
): ResolvedEnv<S> {
  assertDefinition(definition);
  readOptions(options);
  const values: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];

  for (const name of Object.keys(definition.shape)) {
    const builder = definition.shape[name]!;
    const raw = Object.hasOwn(options.source, name) ? options.source[name] : undefined;

    if (raw !== undefined) {
      if (typeof raw !== "string") {
        issues.push(invalidIssue(name, builder, "Expected a string value"));
      } else {
        parseValue(name, builder, raw, values, issues);
      }
      continue;
    }

    resolveMissing(name, builder, options.environment, values, issues);
  }

  if (issues.length > 0) throw new EnvResolutionError(issues);
  return Object.freeze(values) as ResolvedEnv<S>;
}

/** Returns deterministic, JSON-safe metadata without runtime environment values. */
export function projectEnv<S extends EnvShape>(
  definition: EnvDefinition<S>,
): readonly EnvProjection[] {
  assertDefinition(definition);
  return Object.freeze(
    Object.keys(definition.shape)
      .sort()
      .map((name) => Object.freeze({ name, ...definition.shape[name]!.metadata })),
  );
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
    if (value === undefined) {
      issues.push(invalidIssue(name, builder, "Parser returned no value"));
    } else {
      values[name] = freezeValue(value);
    }
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
  } else {
    values[name] = undefined;
  }
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

function readOptions(options: ResolveEnvOptions): void {
  if (
    !isRecord(options) ||
    typeof options.environment !== "string" ||
    options.environment.length === 0
  ) {
    throw new TypeError("Environment resolution requires an environment name");
  }
  assertSource(options.source);
}

function assertDefinition(value: unknown): asserts value is EnvDefinition<EnvShape> {
  if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape)) {
    throw new TypeError("Expected an environment definition");
  }
  for (const builder of Object.values(value.shape)) {
    if (
      !isRecord(builder) ||
      builder.kind !== "env-builder" ||
      typeof builder.parse !== "function" ||
      typeof builder.getDefault !== "function" ||
      !isRecord(builder.metadata)
    ) {
      throw new TypeError("Environment definitions must contain env builders");
    }
  }
}

function assertSource(value: unknown): asserts value is EnvSource {
  if (!isRecord(value)) throw new TypeError("Environment source must be an object");
  for (const entry of Object.values(value)) {
    if (entry !== undefined && typeof entry !== "string") {
      throw new TypeError("Environment source values must be strings or undefined");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
