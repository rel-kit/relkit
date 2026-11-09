import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import { metadata, updateMetadata } from "./env-builder-metadata.js";
import { toJsonValueEffect } from "./env-json.js";
import type { DefaultFactory, Parse } from "./env-builder.types.js";
import type { EnvBuilder, EnvMetadata, EnvValueType, LiteralValue } from "./env.types.js";

class EnvironmentBuilder<T> implements EnvBuilder<T> {
  readonly kind = "env-builder" as const;
  readonly parse: Parse<T>;
  readonly metadata: EnvMetadata;
  private readonly rawParse: Parse<T>;
  private readonly defaultFactory: DefaultFactory<T> | undefined;

  constructor(parse: Parse<T>, metadata: EnvMetadata, defaultFactory?: DefaultFactory<T>) {
    this.rawParse = parse;
    this.parse = (value) => runConfigSync(parseEnvBuilderEffect(parse, value));
    this.metadata = metadata;
    this.defaultFactory = defaultFactory;
    Object.freeze(this);
  }

  getDefault(): Exclude<T, undefined> | undefined {
    return runConfigSync(
      observeConfig(
        "builder-get-default",
        Effect.sync(() => this.defaultFactory?.()),
      ),
    );
  }

  default(value: Exclude<T, undefined> | (() => Exclude<T, undefined>)) {
    return runConfigSync(
      observeConfig(
        "builder-default",
        Effect.sync(() => {
          const factory = typeof value === "function" ? (value as DefaultFactory<T>) : () => value;
          return this.copy<Exclude<T, undefined>>(
            this.rawParse as Parse<Exclude<T, undefined>>,
            updateMetadata(this.metadata, { hasDefault: true }),
            factory as DefaultFactory<Exclude<T, undefined>>,
          );
        }),
      ),
    );
  }

  optional() {
    return runConfigSync(
      observeConfig(
        "builder-optional",
        Effect.sync(() =>
          this.copy<T | undefined>(
            this.rawParse,
            updateMetadata(this.metadata, { optional: true }),
            this.defaultFactory,
          ),
        ),
      ),
    );
  }

  requiredIn(...environments: readonly string[]) {
    const builder = this;
    return runConfigSync(
      observeConfig(
        "builder-required-in",
        Effect.gen(function* () {
          if (environments.some((environment) => environment.length === 0)) {
            return yield* Effect.fail(
              new ConfigValidationError({ message: "Environment names must not be empty" }),
            );
          }
          const requiredIn = [...new Set([...builder.metadata.requiredIn, ...environments])];
          return builder.copy(
            builder.rawParse,
            updateMetadata(builder.metadata, { requiredIn }),
            builder.defaultFactory,
          );
        }),
      ),
    );
  }

  description(text: string) {
    return runConfigSync(
      observeConfig(
        "builder-description",
        Effect.sync(() =>
          this.copy(
            this.rawParse,
            updateMetadata(this.metadata, { description: text }),
            this.defaultFactory,
          ),
        ),
      ),
    );
  }

  example(value: T) {
    const builder = this;
    return runConfigSync(
      observeConfig(
        "builder-example",
        Effect.gen(function* () {
          const example = builder.metadata.sensitive
            ? "[redacted]"
            : yield* toJsonValueEffect(value);
          return builder.copy(
            builder.rawParse,
            updateMetadata(builder.metadata, { example }),
            builder.defaultFactory,
          );
        }),
      ),
    );
  }

  private copy<U>(parse: Parse<U>, metadata: EnvMetadata, defaultFactory?: DefaultFactory<U>) {
    return new EnvironmentBuilder(parse, metadata, defaultFactory);
  }
}

/** Parse a builder's raw input through an observable, typed Effect.
 * @param parse - Field parser used by the builder.
 * @param value - Raw environment string.
 * @returns Effect with the parsed value or ConfigValidationError for expected parser failures.
 * @example Effect.runSync(parseEnvBuilderEffect(Number, "2"));
 */
export function parseEnvBuilderEffect<T>(
  parse: Parse<T>,
  value: string,
): Effect.Effect<Exclude<T, undefined>, ConfigValidationError> {
  return observeConfig(
    "builder-parse",
    Effect.flatMap(
      Effect.sync(() => {
        try {
          return { ok: true as const, value: parse(value) };
        } catch (cause) {
          if (cause instanceof TypeError || cause instanceof SyntaxError) {
            return {
              ok: false as const,
              message: cause.message,
              syntax: cause instanceof SyntaxError,
            };
          }
          throw cause;
        }
      }),
      (result) =>
        result.ok
          ? Effect.succeed(result.value)
          : Effect.fail(
              new ConfigValidationError({ message: result.message, syntax: result.syntax }),
            ),
    ),
  );
}

/** Create a frozen field builder through the Effect path.
 * @param type - Declared field type.
 * @param parse - Compatibility parser for raw strings.
 * @param sensitive - Whether examples and errors should be redacted.
 * @param values - Optional literal choices.
 * @returns Effect with a field builder and no expected failures.
 * @example Effect.runSync(createEnvBuilderEffect("string", (value) => value));
 */
export function createEnvBuilderEffect<T>(
  type: EnvValueType,
  parse: Parse<T>,
  sensitive = false,
  values?: readonly LiteralValue[],
): Effect.Effect<EnvBuilder<T>> {
  return observeConfig(
    "builder-create",
    Effect.sync(() => new EnvironmentBuilder(parse, metadata(type, sensitive, values))),
  );
}

/** Create a field builder synchronously for existing callers.
 * @param type - Declared field type.
 * @param parse - Compatibility parser for raw strings.
 * @param sensitive - Whether examples and errors should be redacted.
 * @param values - Optional literal choices.
 * @returns Frozen field builder.
 * @example createEnvBuilder("string", (value) => value);
 */
export function createEnvBuilder<T>(
  type: EnvValueType,
  parse: Parse<T>,
  sensitive = false,
  values?: readonly LiteralValue[],
): EnvBuilder<T> {
  return runConfigSync(createEnvBuilderEffect(type, parse, sensitive, values));
}
