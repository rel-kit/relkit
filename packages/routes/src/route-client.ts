import { isStreamOutputSchema } from "@relkit/functions";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type { NativeStreamFormat, RouteClientPolicy } from "./route.types.js";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";

/** Copies a client policy through a typed Effect.
 * @param value - Candidate client policy.
 * @returns Copied policy or a tagged invalid-input failure.
 * @example Effect.runSync(copyClientEffect({ operation: "query" }));
 */
export const copyClientEffect = Effect.fn("routes.client.copy")((value: unknown) =>
  routeTry("client.copy", () => copyClientValue(value)),
);

/** Copies a client policy for synchronous authoring.
 * @param value - Candidate client policy.
 * @returns Copied policy.
 * @throws TypeError when the policy is invalid.
 * @example copyClient({ operation: "query" });
 */
export function copyClient(value: unknown): RouteClientPolicy | undefined {
  return runRouteSync(copyClientEffect(value));
}

/** Copies client policy inside an already observed operation.
 * @param value - Candidate client policy.
 * @returns A copied policy or undefined.
 * @throws RouteInputError for an invalid policy.
 * @example copyClientValue({ operation: "query" });
 */
export function copyClientValue(value: unknown): RouteClientPolicy | undefined {
  if (value === undefined || value === false) return value;
  if (!isRecord(value) || Reflect.ownKeys(value).some((key) => key !== "operation")) {
    throw new RouteInputError("Route client must be false or an operation policy");
  }
  if (
    value.operation !== undefined &&
    value.operation !== "query" &&
    value.operation !== "mutation"
  ) {
    throw new RouteInputError("Route client operation must be query or mutation");
  }
  return value.operation === undefined ? {} : { operation: value.operation };
}

/** Copies a native stream policy through a typed Effect.
 * @param value - Candidate stream policy.
 * @param output - Function output schema.
 * @returns Copied stream format or a tagged invalid-input failure.
 * @example Effect.runSync(copyStreamEffect(undefined, output));
 */
export const copyStreamEffect = Effect.fn("routes.stream.copy")(
  (value: unknown, output: StandardSchemaV1) =>
    routeTry("stream.copy", () => copyStreamValue(value, output)),
);

/** Copies a native stream policy for synchronous authoring.
 * @param value - Candidate stream policy.
 * @param output - Function output schema.
 * @returns Copied stream format.
 * @throws TypeError when the policy or output schema is incompatible.
 * @example copyStream(undefined, output);
 */
export function copyStream(
  value: unknown,
  output: StandardSchemaV1,
): { readonly format: NativeStreamFormat } | undefined {
  return runRouteSync(copyStreamEffect(value, output));
}

/** Copies stream policy inside an already observed operation.
 * @param value - Candidate stream policy.
 * @param output - Function output schema.
 * @returns A copied stream policy or undefined.
 * @throws RouteInputError for invalid stream settings.
 * @example copyStreamValue({ format: "sse" }, streamOutput);
 */
export function copyStreamValue(
  value: unknown,
  output: StandardSchemaV1,
): { readonly format: NativeStreamFormat } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Reflect.ownKeys(value).length !== 1) {
    throw new RouteInputError("Route stream must declare exactly one format");
  }
  if (value.format !== "sse" && value.format !== "text" && value.format !== "bytes") {
    throw new RouteInputError("Route stream format must be sse, text, or bytes");
  }
  if (!isStreamOutputSchema(output))
    throw new RouteInputError("Route stream format requires streamOf");
  return { format: value.format };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
