import type { JsonValue } from "@relkit/contracts";

/** A projected JSON Schema fragment or an intentionally dynamic field. */
export type ClientSchemaMetadata = JsonValue | { readonly kind: "dynamic" };

/** One client-visible state field with its projected schema. */
export interface ClientTypeField {
  readonly name: string;
  readonly schema: ClientSchemaMetadata;
  readonly optional?: true;
}
