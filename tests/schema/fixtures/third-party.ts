import type { StandardSchemaV1 } from "../../../../packages/schema/src/index.ts";

type Product = { readonly name: string };

/** A small Standard Schema v1 fixture with its own deterministic projection hook. */
export const thirdPartyProduct: StandardSchemaV1<unknown, Product> & {
  readonly zsys: { readonly jsonSchema: () => Record<string, unknown> };
} = {
  "~standard": {
    version: 1,
    vendor: "third-party-fixture",
    validate(value) {
      if (!isRecord(value) || typeof value.name !== "string") {
        return { issues: [{ message: "Expected a product name", path: ["name"] }] };
      }
      return { value: { name: value.name.trim() } };
    },
  },
  zsys: {
    jsonSchema: () => ({
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 1 } },
    }),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
