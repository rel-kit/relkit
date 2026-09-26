import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";

/** Standard Schema contract for an asynchronous sequence of validated items.
 * @example const output: StreamOutputSchema = streamOf(z.string());
 */
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
