import { toJsonValue } from "./env-json.js";
import type {
  EnvBuilder,
  EnvBuilderBase,
  EnvMetadata,
  EnvValueType,
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
    if (environments.some((environment) => environment.length === 0))
      throw new TypeError("Environment names must not be empty");
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

export function createEnvBuilder<T>(
  type: EnvValueType,
  parse: Parse<T>,
  sensitive = false,
  values?: readonly LiteralValue[],
): EnvBuilder<T> {
  return new EnvironmentBuilder(parse, metadata(type, sensitive, values));
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
