import type { HttpTriggerRegistration } from "@relkit/graph";
import { validate } from "@relkit/schema";
import { Effect } from "effect";
import { httpBoundary } from "./http-effect.js";
import { findSchema, type ResponseDeclaration } from "./response-mapping-utils.js";
import type { ResponseMappingOptions } from "./response-mapping.types.js";

/** Validates foreign Standard Schema implementations only outside production mode.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param declaration - Selected response declaration used to locate its output schema.
 * @param value - Value inspected, validated or projected by this operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An Effect yielding whether the schema accepts the value, or true when checking is disabled.
 */
export const responseIsValid = Effect.fn("ResponseMapping.validate")(function* (
  trigger: HttpTriggerRegistration,
  declaration: ResponseDeclaration | undefined,
  value: unknown,
  options: ResponseMappingOptions,
) {
  if (options.mode === "production") return true;
  const schema = findSchema(trigger, declaration, options.responseSchemas);
  if (schema === undefined) return true;
  return yield* httpBoundary("response.validate", () =>
    Promise.resolve(validate(schema, value as never)),
  ).pipe(
    Effect.map((result) => "value" in result),
    Effect.catch(() => Effect.succeed(false)),
  );
});
