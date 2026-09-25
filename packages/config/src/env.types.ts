import type { JsonValue } from "./env-json.types.js";

export type { BindingValueRef } from "@relkit/provider";
export type { EnvBuilderFactory } from "./env-factory.types.js";

/** Scalar literals accepted by `env.literal`.
 * @example env.literal("test", "production");
 */
export type LiteralValue = string | number | boolean;

/** Stable field type emitted in metadata.
 * @example const type: EnvValueType = "secret-string";
 */
export type EnvValueType =
  "string" | "number" | "boolean" | "port" | "literal" | "url" | "json" | "secret-string";

/** JSON-safe metadata emitted by an environment declaration.
 * Defaults are represented by `hasDefault` and never exposed here.
 * @example const metadata = env.secret().metadata;
 */
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

/** Typed, value-free reference to one declared variable.
 * `__value` is phantom typing; the declaration never reads source values.
 * @example const reference = defineEnv({ MODE: env.string() }).MODE;
 */
export interface EnvRef<Name extends string = string, Value = unknown> {
  readonly kind: "env-ref";
  readonly name: Name;
  readonly type: EnvValueType;
  readonly sensitive: boolean;
  readonly metadata: EnvMetadata;
  readonly __value?: Value;
}

/** Minimum builder contract used during resolution.
 * `parse` and `getDefault` remain synchronous compatibility callbacks.
 * @example const field: EnvBuilderBase = env.string();
 */
export interface EnvBuilderBase {
  readonly kind: "env-builder";
  readonly metadata: EnvMetadata;
  /** Parse a raw string through the field's Effect-backed compatibility adapter.
   * @param value - Raw environment value.
   * @returns Parsed field value.
   * @throws TypeError for invalid built-in values; custom parsers may throw.
   * @example env.number().parse("2");
   */
  readonly parse: (value: string) => unknown;
  /** Produce a lazy default only when resolution needs it.
   * @returns Default value or undefined.
   * @throws A user default factory's original error.
   * @example env.string().default("test").getDefault();
   */
  readonly getDefault: () => unknown;
}

/** Value-free field declaration with immutable fluent metadata methods.
 * Every method returns a new frozen builder; the original remains unchanged.
 * @example const mode = env.string().default("test").description("Runtime mode");
 */
export interface EnvBuilder<T> extends EnvBuilderBase {
  readonly parse: (value: string) => Exclude<T, undefined>;
  readonly getDefault: () => Exclude<T, undefined> | undefined;
  /** Attach a lazy or literal default.
   * @param value - Default literal or factory, invoked during resolution.
   * @returns A new builder whose value is required when present.
   * @example env.string().default("test");
   */
  default(
    value: Exclude<T, undefined> | (() => Exclude<T, undefined>),
  ): EnvBuilder<Exclude<T, undefined>>;
  /** Allow absence outside explicitly required environments.
   * @returns A new builder whose value may be undefined.
   * @example env.string().optional();
   */
  optional(): EnvBuilder<T | undefined>;
  /** Require the field in named environments.
   * @param environments - Environment names, with duplicates removed.
   * @returns A new builder with merged requirement metadata.
   * @throws TypeError when a name is empty.
   * @example env.string().requiredIn("production");
   */
  requiredIn(...environments: readonly string[]): EnvBuilder<T>;
  /** Add human-readable field guidance.
   * @param text - Description shown in metadata.
   * @returns A new builder with a description.
   * @example env.string().description("Public origin");
   */
  description(text: string): EnvBuilder<T>;
  /** Add a JSON-safe example, redacting sensitive fields.
   * @param value - Example value.
   * @returns A new builder with example metadata.
   * @throws TypeError when a public example is not JSON-safe.
   * @example env.url().example(new URL("https://example.test"));
   */
  example(value: T): EnvBuilder<T>;
}

/** Map field names to builders without reading runtime values.
 * @example const shape: EnvShape = { MODE: env.string() };
 */
export type EnvShape = { readonly [name: string]: EnvBuilderBase };
/** Extract a field builder's resolved value type.
 * @example type Mode = InferEnvValue<ReturnType<typeof env.string>>;
 */
export type InferEnvValue<B> = B extends EnvBuilder<infer T> ? T : never;
/** Infer the immutable runtime value object from a declaration shape.
 * @example type Values = InferEnvValues<{ MODE: EnvBuilder<string> }>;
 */
export type InferEnvValues<S extends EnvShape> = {
  readonly [K in keyof S]: InferEnvValue<S[K]>;
};
/** Infer a metadata map from a declaration shape.
 * @example type Metadata = EnvMetadataMap<{ MODE: EnvBuilder<string> }>;
 */
export type EnvMetadataMap<S extends EnvShape> = {
  readonly [K in keyof S]: EnvMetadata;
};

/** Immutable, value-free declaration returned by `defineEnv`.
 * Field references are non-enumerable; shape and metadata are frozen.
 * @example const declaration: EnvDefinition<{ MODE: EnvBuilder<string> }> = defineEnv({ MODE: env.string() });
 */
export type EnvDefinition<S extends EnvShape> = {
  readonly kind: "env-definition";
  readonly shape: S;
  readonly metadata: EnvMetadataMap<S>;
} & {
  readonly [K in keyof S]: EnvRef<K & string, InferEnvValue<S[K]>>;
};
