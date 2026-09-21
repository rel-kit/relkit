import { createHash } from "node:crypto";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import {
  getJsonSchema,
  getSchemaMetadata,
  isSchemaTransformed,
  type StandardSchemaV1,
} from "@relkit/schema";
import { isRecord, json } from "./normalize-utils.js";

export type SchemaDirection = "legacy" | "input" | "output";

export interface SchemaResult {
  readonly ok: boolean;
  readonly schema?: JsonValue;
  readonly inputSchema?: JsonValue;
  readonly outputSchema?: JsonValue;
  readonly contractHash?: string;
  readonly transformed?: boolean;
  readonly refined?: boolean;
  readonly reason?: string;
}

/** Reads live schemas and evaluator markers without ever turning a marker back into a validator. */
export function schema(value: unknown, direction: SchemaDirection = "legacy"): SchemaResult {
  if (isSchemaSnapshot(value)) return snapshotResult(value, direction);
  if (!isSchema(value)) return { ok: false, reason: "value is not a Standard Schema v1 validator" };
  const selected = getJsonSchema(value, direction === "legacy" ? undefined : { direction });
  if (!selected.ok) return { ok: false, reason: selected.reason };
  const input = getJsonSchema(value, { direction: "input" });
  const output = getJsonSchema(value, { direction: "output" });
  const standard = value["~standard"];
  return {
    ok: true,
    schema: selected.schema,
    ...(input.ok ? { inputSchema: input.schema } : {}),
    ...(output.ok ? { outputSchema: output.schema } : {}),
    contractHash: hashContract({
      input: input.ok ? input.schema : null,
      output: output.ok ? output.schema : null,
      direction,
      transformed: isSchemaTransformed(value),
      vendor: standard.vendor,
      validator: standard.validate.toString(),
    }),
    transformed: isSchemaTransformed(value),
    refined: getSchemaMetadata(value)?.refined === true,
  };
}

export function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}

export function schemaHash(result: SchemaResult): string | undefined {
  return result.contractHash;
}

function snapshotResult(value: SchemaSnapshot, direction: SchemaDirection): SchemaResult {
  if (value.$relkit === "schema-unavailable") {
    return { ok: false, reason: typeof value.reason === "string" ? value.reason : "unavailable" };
  }
  const legacy = value.jsonSchema;
  const input = value.inputJsonSchema ?? legacy;
  const output = value.outputJsonSchema ?? legacy;
  const selected =
    direction === "input" ? input : direction === "output" ? output : (legacy ?? output ?? input);
  if (!json(selected)) {
    return { ok: false, reason: "schema snapshot has no JSON Schema projection" };
  }
  return {
    ok: true,
    schema: selected,
    ...(json(input) ? { inputSchema: input } : {}),
    ...(json(output) ? { outputSchema: output } : {}),
    contractHash:
      typeof value.contractHash === "string"
        ? value.contractHash
        : hashContract({
            input: json(input) ? input : null,
            output: json(output) ? output : null,
            direction,
          }),
    ...(value.transformed === true ? { transformed: true } : {}),
    ...(value.refined === true ? { refined: true } : {}),
  };
}

interface SchemaSnapshot {
  readonly $relkit: string;
  readonly jsonSchema?: JsonValue;
  readonly inputJsonSchema?: JsonValue;
  readonly outputJsonSchema?: JsonValue;
  readonly contractHash?: string;
  readonly transformed?: boolean;
  readonly refined?: boolean;
  readonly reason?: string;
}

function isSchemaSnapshot(value: unknown): value is SchemaSnapshot {
  return isRecord(value) && typeof value.$relkit === "string" && value.$relkit.startsWith("schema");
}

function hashContract(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
