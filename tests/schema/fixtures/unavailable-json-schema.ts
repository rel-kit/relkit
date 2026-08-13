import type { StandardSchemaV1 } from "../../../../packages/schema/src/index.ts";

/** A compatible validator that intentionally has no deterministic JSON Schema hook. */
export const unavailableJsonSchema: StandardSchemaV1 = {
  "~standard": {
    version: 1,
    vendor: "unavailable-json-schema-fixture",
    validate(value) {
      return { value };
    },
  },
};
