import { toJsonValue, type JsonValue } from "./env-json.js";
import {
  type EnvBuilder,
  type EnvBuilderBase,
  type EnvBuilderFactory,
  type EnvDefinition,
  type EnvMetadata,
  type EnvMetadataMap,
  type EnvShape,
  type EnvValueType,
  type InferEnvValue,
  type InferEnvValues,
  type LiteralValue,
} from "./env-types.js";

export type { JsonValue } from "./env-json.js";
export type {
  EnvBuilder,
  EnvBuilderBase,
  EnvBuilderFactory,
  EnvDefinition,
  EnvMetadata,
  EnvMetadataMap,
  EnvShape,
  EnvValueType,
  InferEnvValue,
  InferEnvValues,
  LiteralValue,
} from "./env-types.js";

type Parse<T> = (value: string) => Exclude<T, undefined>;
type DefaultFactory<T> = () => Exclude<T, undefined>;

class EnvironmentBuilder<T> implements EnvBuilder<T> {
  readonly kind = "env-builder" as const;
  readonly parse: Parse<T>;
  readonly metadata: EnvMetadata;
  private readonly defaultFactory: DefaultFactory<T> | undefined;

  constructor(parse: Parse<T>, metadata: EnvMetadata, defaultFactory?: DefaultFactory<T>) {
    this.parse = parse;
    this.metadata = metadata;
    this.defaultFactory = defaultFactory;
    Object.freeze(this);
  }

  getDefault(): Exclude<T, undefined> | undefined {
    return this.defaultFactory?.();
  }

  default(value: Exclude<T, undefined> | (() => Exclude<T, undefined>)) {
    const factory = typeof value === "function" ? (value as DefaultFactory<T>) : () => value;
    return this.copy<Exclude<T, undefined>>(
      this.parse as Parse<Exclude<T, undefined>>,
      updateMetadata(this.metadata, { hasDefault: true }),
      factory as DefaultFactory<Exclude<T, undefined>>,
    );
  }

  optional() {
    return this.copy<T | undefined>(
      this.parse,
      updateMetadata(this.metadata, { optional: true }),
      this.defaultFactory,
    );
  }

  requiredIn(...environments: readonly string[]) {
    if (environments.some((environment) => environment.length === 0)) {
      throw new TypeError("Environment names must not be empty");
    }
    const requiredIn = [...new Set([...this.metadata.requiredIn, ...environments])];
    return this.copy(
      this.parse,
      updateMetadata(this.metadata, { requiredIn }),
      this.defaultFactory,
    );
  }

  description(text: string) {
    return this.copy(
      this.parse,
      updateMetadata(this.metadata, { description: text }),
      this.defaultFactory,
    );
  }

  example(value: T) {
    const example = this.metadata.sensitive ? "[redacted]" : toJsonValue(value);
    return this.copy(this.parse, updateMetadata(this.metadata, { example }), this.defaultFactory);
  }

  private copy<U>(parse: Parse<U>, metadata: EnvMetadata, defaultFactory?: DefaultFactory<U>) {
    return new EnvironmentBuilder(parse, metadata, defaultFactory);
  }
}

/** Provides the value-free environment field builders. */
export const env: EnvBuilderFactory = Object.freeze({
  string: () => createBuilder("string", (value) => value),
  number: () => createBuilder("number", parseNumber),
  boolean: () => createBuilder("boolean", parseBoolean),
  port: () => createBuilder("port", parsePort),
  literal: <const Values extends readonly [LiteralValue, ...LiteralValue[]]>(...values: Values) => {
    if (values.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new TypeError("Literal values must be finite");
    }
    const options = Object.freeze([...values]);
    return new EnvironmentBuilder<Values[number]>(
      (value) => parseLiteral(value, options),
      metadata("literal", false, options),
    );
  },
  url: () => createBuilder("url", (value) => new URL(value)),
  json: () => createBuilder("json", (value) => toJsonValue(JSON.parse(value))),
  secret: () => createBuilder("secret-string", (value) => value, true),
});

/** Creates an immutable environment declaration without reading runtime values. */
export function defineEnv<const S extends EnvShape>(shape: S): EnvDefinition<S> {
  const entries = Object.keys(shape).map((name) => [name, shape[name]!] as const);
  if (entries.some(([, field]) => field.kind !== "env-builder")) {
    throw new TypeError("Environment definitions must contain env builders");
  }
  const frozenShape = Object.freeze({ ...shape }) as S;
  const metadata = Object.freeze(
    Object.fromEntries(entries.map(([name, field]) => [name, field.metadata])),
  ) as EnvMetadataMap<S>;
  return Object.freeze({ kind: "env-definition" as const, shape: frozenShape, metadata });
}

function createBuilder<T>(type: EnvValueType, parse: Parse<T>, sensitive = false): EnvBuilder<T> {
  return new EnvironmentBuilder(parse, metadata(type, sensitive));
}

function metadata(
  type: EnvValueType,
  sensitive: boolean,
  values?: readonly LiteralValue[],
): EnvMetadata {
  return freezeMetadata({
    type,
    requiredIn: [],
    hasDefault: false,
    optional: false,
    sensitive,
    ...(values ? { values } : {}),
  });
}

function updateMetadata(value: EnvMetadata, changes: Record<string, unknown>): EnvMetadata {
  return freezeMetadata({ ...value, ...changes } as EnvMetadata);
}

function freezeMetadata(value: EnvMetadata): EnvMetadata {
  return Object.freeze({
    ...value,
    requiredIn: Object.freeze([...value.requiredIn]),
    ...(value.values ? { values: Object.freeze([...value.values]) } : {}),
  });
}

function parseNumber(value: string): number {
  const parsed = Number(value.trim());
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    throw new TypeError("Expected a finite number");
  }
  return parsed;
}

function parsePort(value: string): number {
  const parsed = parseNumber(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new TypeError("Expected a port from 1 through 65535");
  }
  return parsed;
}

function parseBoolean(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TypeError("Expected true or false");
}

function parseLiteral<T extends LiteralValue>(value: string, values: readonly T[]): T {
  const match = values.find((expected) => String(expected) === value);
  if (match === undefined) throw new TypeError(`Expected one of: ${values.join(", ")}`);
  return match;
}
