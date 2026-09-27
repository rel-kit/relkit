import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result } from "effect";
import { ClientUtilityFailure } from "./client-utils-error.js";
import {
  assertOptionsValue,
  assertOptionalTextValue,
  parseInputValue,
  resolveProviderValue,
} from "./client-utils-value.js";
import { observeJobs } from "./jobs-observability.js";
import type { JobProvider } from "./client.types.js";
/** Resolves a job provider in Effect.
 * @param source - Provider or profile map.
 * @param profile - Selected profile.
 * @param resolveProfile - Optional profile resolver.
 * @returns Provider or ClientUtilityFailure.
 * @example Effect.runSync(resolveProviderEffect(source, "default"));
 */
export const resolveProviderEffect = Effect.fn("Jobs.resolveClientProvider")(
  (source: unknown, profile: string, resolveProfile: ((profile: string) => unknown) | undefined) =>
    observeJobs(
      "client.resolveProvider",
      Effect.try({
        try: () => resolveProviderValue(source, profile, resolveProfile),
        catch: (cause) => new ClientUtilityFailure({ cause }),
      }),
    ),
);
/** Synchronous provider resolver.
 * @param source - Provider or profile map.
 * @param profile - Selected profile.
 * @param resolveProfile - Optional profile resolver.
 * @returns Selected provider.
 * @throws Original profile or provider error.
 * @example resolveProvider(source, "default", undefined);
 */
export function resolveProvider(
  source: unknown,
  profile: string,
  resolveProfile: ((profile: string) => unknown) | undefined,
): JobProvider {
  const result = Effect.runSync(
    Effect.result(resolveProviderEffect(source, profile, resolveProfile)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Validates client input against an optional schema in Effect.
 * @param schema - Optional input schema.
 * @param input - Untrusted input.
 * @returns Validated value or ClientUtilityFailure.
 * @example Effect.runPromise(parseInputEffect(z.string(), "value"));
 */
export const parseInputEffect = Effect.fn("Jobs.parseClientInput")(
  (schema: StandardSchemaV1 | undefined, input: unknown) =>
    observeJobs(
      "client.parseInput",
      Effect.tryPromise({
        try: () => parseInputValue(schema, input),
        catch: (cause) => new ClientUtilityFailure({ cause }),
      }),
    ),
);
/** Promise compatibility input validator.
 * @param schema - Optional input schema.
 * @param input - Untrusted input.
 * @returns Validated value.
 * @throws Original input validation error.
 * @example await parseInput(z.string(), "value");
 */
export async function parseInput(
  schema: StandardSchemaV1 | undefined,
  input: unknown,
): Promise<unknown> {
  const result = await Effect.runPromise(Effect.result(parseInputEffect(schema, input)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Validates enqueue options in Effect.
 * @param value - Untrusted options.
 * @returns Void or ClientUtilityFailure.
 * @example Effect.runSync(assertOptionsEffect({ correlationId: "request" }));
 */
export const assertOptionsEffect = Effect.fn("Jobs.assertClientOptions")((value: unknown) =>
  observeJobs(
    "client.assertOptions",
    Effect.try({
      try: () => assertOptionsValue(value),
      catch: (cause) => new ClientUtilityFailure({ cause }),
    }),
  ),
);
/** Synchronous enqueue options assertion.
 * @param value - Untrusted options.
 * @returns Nothing when valid.
 * @throws TypeError for invalid options.
 * @example assertOptions({ correlationId: "request" });
 */
export function assertOptions(
  value: unknown,
): asserts value is { readonly correlationId?: string } {
  const result = Effect.runSync(Effect.result(assertOptionsEffect(value)));
  if (Result.isFailure(result)) throw result.failure.cause;
}
/** Validates optional client text in Effect.
 * @param value - Untrusted text.
 * @param name - Diagnostic field name.
 * @returns Void or ClientUtilityFailure.
 * @example Effect.runSync(assertOptionalTextEffect("request", "correlationId"));
 */
export const assertOptionalTextEffect = Effect.fn("Jobs.assertClientOptionalText")(
  (value: unknown, name: string) =>
    observeJobs(
      "client.assertOptionalText",
      Effect.try({
        try: () => assertOptionalTextValue(value, name),
        catch: (cause) => new ClientUtilityFailure({ cause }),
      }),
    ),
);
/** Synchronous optional client text assertion.
 * @param value - Untrusted text.
 * @param name - Diagnostic field name.
 * @returns Nothing when valid.
 * @throws TypeError for invalid text.
 * @example assertOptionalText("request", "correlationId");
 */
export function assertOptionalText(value: unknown, name: string): void {
  const result = Effect.runSync(Effect.result(assertOptionalTextEffect(value, name)));
  if (Result.isFailure(result)) throw result.failure.cause;
}
