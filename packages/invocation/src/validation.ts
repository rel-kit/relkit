import { Effect } from "effect";
import { unexpectedDefect, type InvocationFailure } from "./failure.js";
import { validate, type StandardResult, type StandardSchemaV1 } from "@zsys/schema";
import type {
  InvocationErrorDefinition,
  InvocationIdSource,
  InvocationSource,
} from "./contracts.js";
import { InvocationValidationError } from "./contracts.js";
import { getDescriptorIdentity } from "./identity.js";

export async function validated(
  schema: StandardSchemaV1,
  value: unknown,
  phase: "input" | "output",
): Promise<unknown> {
  let result: StandardResult<unknown>;
  try {
    result = (await validate(schema, value as never)) as StandardResult<unknown>;
  } catch (cause) {
    throw unexpectedDefect(cause);
  }
  if (!("value" in result)) throw new InvocationValidationError(phase, result.issues);
  return result.value;
}

export async function callHook<T>(
  hook: ((value: T) => unknown) | undefined,
  value: T,
): Promise<void> {
  try {
    await hook?.(value);
  } catch {
    // Observability must not replace the invocation result or skip release.
  }
}

export function assertSource(value: string): asserts value is InvocationSource {
  if (!("direct http job event tool agent" as string).split(" ").includes(value)) {
    throw new TypeError(`Unknown invocation source: ${value}`);
  }
}

export async function validateDeclaredError(
  definitions: readonly InvocationErrorDefinition[] | undefined,
  error: InvocationValidationError | InvocationFailure,
): Promise<InvocationValidationError | InvocationFailure> {
  if (error instanceof InvocationValidationError || error.kind !== "application") return error;
  const definition = definitions?.find(
    (candidate) => getDescriptorIdentity(candidate as object) === error.id,
  );
  if (definition === undefined) return unexpectedDefect(new Error("Undeclared application error"));
  try {
    const result = (await validate(
      definition.data,
      error.data as never,
    )) as StandardResult<unknown>;
    return "value" in result ? error : unexpectedDefect(new Error("Invalid declared error data"));
  } catch (cause) {
    return unexpectedDefect(cause);
  }
}

export const defaultIdSource: InvocationIdSource = {
  next: (kind) => `${kind}-${crypto.randomUUID()}` as import("@zsys/contracts").ProtocolId,
};

export const defaultRunner = {
  run: <A, E>(effect: Effect.Effect<A, E, never>, options?: { readonly signal?: AbortSignal }) =>
    Effect.runPromise(effect, options),
};

export const unknownSchema: StandardSchemaV1 = Object.freeze({
  "~standard": Object.freeze({
    version: 1,
    vendor: "zsys",
    validate: (value: unknown) => ({ value }),
  }),
});
