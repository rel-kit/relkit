import {
  createBindingValueRef,
  type BindingValueRef,
  type BindingValueType,
} from "@relkit/provider";
import { createEnvBuilder } from "./env-builder.js";
import { toJsonValue, type JsonValue } from "./env-json.js";
import { createEnvRef, isEnvRef } from "./env-ref.js";
import { parseBoolean, parseLiteral, parseNumber, parsePort } from "./env-parsers.js";

export { isEnvRef };
import {
  type EnvBuilder,
  type EnvBuilderBase,
  type EnvBuilderFactory,
  type EnvDefinition,
  type EnvMetadata,
  type EnvMetadataMap,
  type EnvShape,
  type EnvValueType,
  type EnvRef,
  type InferEnvValue,
  type InferEnvValues,
  type LiteralValue,
} from "./env-types.js";

export type { JsonValue } from "./env-json.js";
export type {
  EnvBuilder,
  EnvBuilderBase,
  EnvBuilderFactory,
  BindingValueRef,
  EnvDefinition,
  EnvMetadata,
  EnvMetadataMap,
  EnvShape,
  EnvValueType,
  EnvRef,
  InferEnvValue,
  InferEnvValues,
  LiteralValue,
} from "./env-types.js";

/**
 * Provides application-field builders and named binding-local value references.
 *
 * @example
 * ```ts
 * import { defineEnv, env } from "@relkit/app/config";
 * const applicationEnv = defineEnv({ PUBLIC_ORIGIN: env.url() });
 * const cacheUrl = env.secret("CACHE_URL");
 * void applicationEnv;
 * void cacheUrl;
 * ```
 * @category Environment
 * @since 0.2.0
 */
export const env: EnvBuilderFactory = Object.freeze({
  string: ((name?: string) =>
    bindingOrBuilder(name, "string", (value) => value)) as EnvBuilderFactory["string"],
  number: ((name?: string) =>
    bindingOrBuilder(name, "number", parseNumber)) as EnvBuilderFactory["number"],
  boolean: ((name?: string) =>
    bindingOrBuilder(name, "boolean", parseBoolean)) as EnvBuilderFactory["boolean"],
  port: ((name?: string) => bindingOrBuilder(name, "port", parsePort)) as EnvBuilderFactory["port"],
  literal: <const Values extends readonly [LiteralValue, ...LiteralValue[]]>(...values: Values) => {
    if (values.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new TypeError("Literal values must be finite");
    }
    const options = Object.freeze([...values]);
    return createEnvBuilder<Values[number]>(
      "literal",
      (value) => parseLiteral(value, options),
      false,
      options,
    );
  },
  url: ((name?: string) =>
    bindingOrBuilder(name, "url", (value) => new URL(value))) as EnvBuilderFactory["url"],
  json: ((name?: string) =>
    bindingOrBuilder(name, "json", (value) =>
      toJsonValue(JSON.parse(value)),
    )) as EnvBuilderFactory["json"],
  secret: ((name?: string) =>
    bindingOrBuilder(name, "secret-string", (value) => value, true)) as EnvBuilderFactory["secret"],
});

/**
 * Creates an immutable environment declaration without reading runtime values.
 *
 * @example
 * ```ts
 * import { defineEnv, env } from "@relkit/app/config"
 * defineEnv({ API_URL: env.url(), API_TOKEN: env.secret() })
 * ```
 * @category Environment
 * @since 0.1.0
 */
export function defineEnv<const S extends EnvShape>(
  shape: S & { readonly PORT?: never; readonly RELKIT_ENV?: never },
): EnvDefinition<S> {
  const entries = Object.keys(shape).map((name) => [name, shape[name]!] as const);
  if (entries.some(([, field]) => field.kind !== "env-builder")) {
    throw new TypeError("Environment definitions must contain env builders");
  }
  const frozenShape = Object.freeze({ ...shape }) as S;
  const metadata = Object.freeze(
    Object.fromEntries(entries.map(([name, field]) => [name, field.metadata])),
  ) as EnvMetadataMap<S>;
  const definition: Record<string, unknown> = {
    kind: "env-definition",
    shape: frozenShape,
    metadata,
  };
  for (const [name, field] of entries) {
    if (name === "PORT" || name === "RELKIT_ENV") {
      throw new TypeError(
        `Environment variable name "${name}" is framework-reserved${
          name === "PORT" ? "; configure server.port instead" : ""
        }.`,
      );
    }
    if (name === "kind" || name === "shape" || name === "metadata") {
      throw new TypeError(`Environment variable name "${name}" is reserved`);
    }
    Object.defineProperty(definition, name, {
      value: createEnvRef(name, field),
      enumerable: false,
    });
  }
  return Object.freeze(definition) as EnvDefinition<S>;
}

function bindingOrBuilder<Value>(
  name: string | undefined,
  type: BindingValueType,
  parse: (value: string) => Exclude<Value, undefined>,
  sensitive = false,
): EnvBuilder<Value> | BindingValueRef<string, Value> {
  return name === undefined
    ? createEnvBuilder(type, parse, sensitive)
    : createBindingValueRef<string, Value>(name, type);
}
