import type { JsonValue } from "@relkit/contracts";

/** Wire projection direction; legacy retains compatibility selection. */
export type SchemaDirection = "legacy" | "input" | "output";

/** Directional JSON Schema evidence and executable compatibility metadata. */
export type SchemaResult =
  | {
      readonly ok: true;
      readonly schema: JsonValue;
      readonly inputSchema?: JsonValue;
      readonly outputSchema?: JsonValue;
      readonly contractHash: string;
      readonly transformed?: boolean;
      readonly refined?: boolean;
      readonly reason?: never;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly schema?: never;
      readonly inputSchema?: never;
      readonly outputSchema?: never;
      readonly contractHash?: never;
      readonly transformed?: never;
      readonly refined?: never;
    };

/** Data-only schema provenance received from the isolated evaluator. */
export interface SchemaSnapshot {
  readonly $relkit: string;
  readonly jsonSchema?: JsonValue;
  readonly inputJsonSchema?: JsonValue;
  readonly outputJsonSchema?: JsonValue;
  readonly contractHash?: string;
  readonly transformed?: boolean;
  readonly refined?: boolean;
  readonly reason?: string;
}
