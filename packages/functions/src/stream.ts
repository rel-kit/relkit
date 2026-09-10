import {
  getJsonSchema,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@relkit/schema";

export interface StreamOutputSchema<
  ItemSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends StandardSchemaV1<
  AsyncIterable<InferInput<ItemSchema>>,
  AsyncIterable<InferOutput<ItemSchema>>
> {
  readonly kind: "stream";
  readonly item: ItemSchema;
  readonly relkit: {
    readonly jsonSchema: () => { readonly kind: "stream"; readonly item: object };
  };
}

/** Declares a validated asynchronous stream result. */
export function streamOf<const ItemSchema extends StandardSchemaV1>(
  item: ItemSchema,
): StreamOutputSchema<ItemSchema> {
  assertSchema(item);
  return Object.freeze({
    kind: "stream" as const,
    item,
    relkit: {
      jsonSchema: () => {
        const projected = getJsonSchema(item);
        if (!projected.ok) throw new TypeError(projected.reason);
        return { kind: "stream" as const, item: projected.schema };
      },
    },
    "~standard": Object.freeze({
      version: 1 as const,
      vendor: "relkit",
      types: undefined as unknown as {
        readonly input: AsyncIterable<InferInput<ItemSchema>>;
        readonly output: AsyncIterable<InferOutput<ItemSchema>>;
      },
      validate: (value: unknown) =>
        isAsyncIterable(value)
          ? { value: value as AsyncIterable<InferOutput<ItemSchema>> }
          : { issues: [{ message: "Expected an AsyncIterable stream" }] },
    }),
  });
}

export function isStreamOutputSchema(value: unknown): value is StreamOutputSchema {
  return isRecord(value) && value.kind === "stream" && isSchema(value.item);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof value[Symbol.asyncIterator] === "function";
}

function assertSchema(value: unknown): asserts value is StandardSchemaV1 {
  if (!isSchema(value)) throw new TypeError("streamOf item must be a Standard Schema v1 validator");
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
