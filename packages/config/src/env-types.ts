import type { JsonValue } from "./env-json.js";

export type LiteralValue = string | number | boolean;
export type EnvValueType =
  "string" | "number" | "boolean" | "port" | "literal" | "url" | "json" | "secret-string";

/** JSON-safe metadata emitted by an environment declaration. */
export interface EnvMetadata {
  readonly type: EnvValueType;
  readonly requiredIn: readonly string[];
  readonly hasDefault: boolean;
  readonly optional: boolean;
  readonly sensitive: boolean;
  readonly values?: readonly LiteralValue[];
  readonly description?: string;
  readonly example?: JsonValue;
}

export interface EnvBuilderBase {
  readonly kind: "env-builder";
  readonly metadata: EnvMetadata;
  readonly parse: (value: string) => unknown;
  readonly getDefault: () => unknown;
}

/** A value-free environment field declaration with typed fluent metadata methods. */
export interface EnvBuilder<T> extends EnvBuilderBase {
  readonly parse: (value: string) => Exclude<T, undefined>;
  readonly getDefault: () => Exclude<T, undefined> | undefined;
  default(
    value: Exclude<T, undefined> | (() => Exclude<T, undefined>),
  ): EnvBuilder<Exclude<T, undefined>>;
  optional(): EnvBuilder<T | undefined>;
  requiredIn(...environments: readonly string[]): EnvBuilder<T>;
  description(text: string): EnvBuilder<T>;
  example(value: T): EnvBuilder<T>;
}

export type EnvShape = { readonly [name: string]: EnvBuilderBase };
export type InferEnvValue<B> = B extends EnvBuilder<infer T> ? T : never;
export type InferEnvValues<S extends EnvShape> = {
  readonly [K in keyof S]: InferEnvValue<S[K]>;
};
export type EnvMetadataMap<S extends EnvShape> = {
  readonly [K in keyof S]: EnvMetadata;
};

/** The immutable declaration returned by `defineEnv`. */
export interface EnvDefinition<S extends EnvShape> {
  readonly kind: "env-definition";
  readonly shape: S;
  readonly metadata: EnvMetadataMap<S>;
}

export interface EnvBuilderFactory {
  string(): EnvBuilder<string>;
  number(): EnvBuilder<number>;
  boolean(): EnvBuilder<boolean>;
  port(): EnvBuilder<number>;
  literal<const Values extends readonly [LiteralValue, ...LiteralValue[]]>(
    ...values: Values
  ): EnvBuilder<Values[number]>;
  url(): EnvBuilder<URL>;
  json(): EnvBuilder<JsonValue>;
  secret(): EnvBuilder<string>;
}
