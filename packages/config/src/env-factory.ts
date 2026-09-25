import { Effect } from "effect";
import { createBindingValueRef } from "@relkit/provider";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import { createEnvBuilderEffect } from "./env-builder.js";
import { toJsonValueEffect } from "./env-json.js";
import { parseBoolean, parseLiteral, parseNumber, parsePort } from "./env-parsers.js";
import type { BindingValueRef, BindingValueType } from "@relkit/provider";
import type { EnvBuilder, EnvBuilderFactory, LiteralValue } from "./env.types.js";

/** Factory of value-free fields and named binding-local references.
 * @example const declaration = defineEnv({ MODE: env.string() });
 */
export const env: EnvBuilderFactory = Object.freeze({
  string: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "string", (value) => value),
    )) as EnvBuilderFactory["string"],
  number: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "number", parseNumber),
    )) as EnvBuilderFactory["number"],
  boolean: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "boolean", parseBoolean),
    )) as EnvBuilderFactory["boolean"],
  port: ((name?: string) =>
    runConfigSync(bindingOrBuilderEffect(name, "port", parsePort))) as EnvBuilderFactory["port"],
  literal: <const Values extends readonly [LiteralValue, ...LiteralValue[]]>(...values: Values) =>
    runConfigSync(literalBuilderEffect(...values)),
  url: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "url", (value) => runConfigSync(parseUrlEffect(value))),
    )) as EnvBuilderFactory["url"],
  json: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "json", (value) => runConfigSync(parseJsonEffect(value))),
    )) as EnvBuilderFactory["json"],
  secret: ((name?: string) =>
    runConfigSync(
      bindingOrBuilderEffect(name, "secret-string", (value) => value, true),
    )) as EnvBuilderFactory["secret"],
});

/** Build a literal field while rejecting non-finite choices.
 * @param values - One or more allowed literal values.
 * @returns Effect with an immutable builder or ConfigValidationError.
 * @example Effect.runSync(literalBuilderEffect("test", "prod"));
 */
export function literalBuilderEffect<
  const Values extends readonly [LiteralValue, ...LiteralValue[]],
>(...values: Values): Effect.Effect<EnvBuilder<Values[number]>, ConfigValidationError> {
  return observeConfig(
    "builder-literal",
    Effect.gen(function* () {
      if (values.some((value) => typeof value === "number" && !Number.isFinite(value))) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: "Literal values must be finite" }),
        );
      }
      const options = Object.freeze([...values]);
      return yield* createEnvBuilderEffect<Values[number]>(
        "literal",
        (value) => parseLiteral(value, options),
        false,
        options,
      );
    }),
  );
}

/** Build an environment field or a named binding reference.
 * @param name - Optional binding name; omission creates a field builder.
 * @param type - Declared value type.
 * @param parse - Parser used by the synchronous compatibility field.
 * @param sensitive - Whether the field contains a secret.
 * @returns Effect with a builder or binding reference and no expected failures.
 * @example Effect.runSync(bindingOrBuilderEffect(undefined, "string", (value) => value));
 */
export function bindingOrBuilderEffect<Value>(
  name: string | undefined,
  type: BindingValueType,
  parse: (value: string) => Exclude<Value, undefined>,
  sensitive = false,
): Effect.Effect<EnvBuilder<Value> | BindingValueRef<string, Value>> {
  if (name === undefined) {
    return observeConfig("builder-or-binding", createEnvBuilderEffect(type, parse, sensitive));
  }
  return observeConfig(
    "builder-or-binding",
    Effect.sync(() => createBindingValueRef<string, Value>(name, type)),
  );
}

/** Parse a URL with a tagged failure for malformed input.
 * @param value - Raw URL text.
 * @returns Effect with URL or ConfigValidationError.
 * @example Effect.runSync(parseUrlEffect("https://example.test"));
 */
export function parseUrlEffect(value: string): Effect.Effect<URL, ConfigValidationError> {
  return observeConfig(
    "parse-url",
    Effect.flatMap(
      Effect.sync(() => {
        try {
          return new URL(value);
        } catch (cause) {
          if (cause instanceof TypeError) return cause;
          throw cause;
        }
      }),
      (result) =>
        result instanceof URL
          ? Effect.succeed(result)
          : Effect.fail(new ConfigValidationError({ message: result.message })),
    ),
  );
}

/** Parse JSON and normalize it to immutable metadata-safe values.
 * @param value - Raw JSON text.
 * @returns Effect with JSON data or ConfigValidationError.
 * @example Effect.runSync(parseJsonEffect("{\"count\":2}"));
 */
export function parseJsonEffect(value: string) {
  return observeConfig(
    "parse-json",
    Effect.flatMap(
      Effect.sync(() => {
        try {
          return { ok: true as const, value: JSON.parse(value) as unknown };
        } catch (cause) {
          if (cause instanceof SyntaxError) return { ok: false as const, message: cause.message };
          throw cause;
        }
      }),
      (result) =>
        result.ok
          ? toJsonValueEffect(result.value)
          : Effect.fail(new ConfigValidationError({ message: result.message, syntax: true })),
    ),
  );
}
