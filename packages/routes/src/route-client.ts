import { isStreamOutputSchema } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import type { NativeStreamFormat, RouteClientPolicy } from "./route-types.js";

export function copyClient(value: unknown): RouteClientPolicy | undefined {
  if (value === undefined || value === false) return value;
  if (!isRecord(value) || Reflect.ownKeys(value).some((key) => key !== "operation")) {
    throw new TypeError("Route client must be false or an operation policy");
  }
  if (
    value.operation !== undefined &&
    value.operation !== "query" &&
    value.operation !== "mutation"
  ) {
    throw new TypeError("Route client operation must be query or mutation");
  }
  return value.operation === undefined ? {} : { operation: value.operation };
}

export function copyStream(
  value: unknown,
  output: StandardSchemaV1,
): { readonly format: NativeStreamFormat } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Reflect.ownKeys(value).length !== 1) {
    throw new TypeError("Route stream must declare exactly one format");
  }
  if (value.format !== "sse" && value.format !== "text" && value.format !== "bytes") {
    throw new TypeError("Route stream format must be sse, text, or bytes");
  }
  if (!isStreamOutputSchema(output)) throw new TypeError("Route stream format requires streamOf");
  return { format: value.format };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
