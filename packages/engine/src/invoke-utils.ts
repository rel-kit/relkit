import { Effect } from "effect";
import {
  unexpectedDefect,
  type InvocationFailure,
  type InvocationRunner,
} from "@zsys/runtime-effect";
import { validate, type StandardResult, type StandardSchemaV1 } from "@zsys/schema";
import type {
  InvocationErrorDefinition,
  InvocationIdSource,
  InvocationMetadata,
  InvocationOutcome,
  InvocationRecord,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";
import { InvocationValidationError } from "./invoke-types.js";
export { linkSignals, makeContext } from "./invoke-context.js";

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

export function assertSource(
  value: string,
): asserts value is import("./invoke-types.js").InvocationSource {
  if (!("direct http job event tool agent" as string).split(" ").includes(value)) {
    throw new TypeError(`Unknown invocation source: ${value}`);
  }
}

export async function validateDeclaredError(
  definitions: readonly InvocationErrorDefinition[] | undefined,
  error: InvocationValidationError | InvocationFailure,
): Promise<InvocationValidationError | InvocationFailure> {
  if (error instanceof InvocationValidationError || error.kind !== "application") return error;
  const definition = definitions?.find((candidate) => candidate.id === error.id);
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

export function resolveTarget<Input, Output, Context extends { readonly signal: AbortSignal }>(
  options: InvokeOptions<Input, Output, Context>,
): InvocationTarget<Input, Output, Context> {
  if (options.target !== undefined) return options.target;
  if (options.registry === undefined || options.functionId === undefined) {
    throw new TypeError("Invocation target is required");
  }
  const handler = options.registry.get(options.functionId);
  if (handler === undefined)
    throw new TypeError(`Function handler is not registered: ${options.functionId}`);
  return {
    id: options.functionId,
    input: options.inputSchema ?? unknownSchema,
    output: options.outputSchema ?? unknownSchema,
    ...(options.errors === undefined ? {} : { errors: options.errors }),
    handler: handler as InvocationTarget<Input, Output, Context>["handler"],
  };
}

export function createRecord<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = import("./invoke-types.js").InvocationContext,
>(
  functionId: string,
  source: import("./invoke-types.js").InvocationSource,
  options: InvokeOptions<Input, Output, Context>,
  traceId: string,
  deadlineMs: number | undefined,
  now: number,
  idSource: InvocationIdSource,
): InvocationRecord {
  const correlationId = options.correlationId ?? options.parent?.correlationId;
  const metadata: InvocationMetadata = {
    id: idSource.next("invocation"),
    traceId,
    ...(options.parent?.id === undefined ? {} : { parentId: options.parent.id }),
    ...(correlationId === undefined ? {} : { correlationId }),
    startedAt: new Date(now).toISOString(),
    ...(deadlineMs === undefined ? {} : { deadline: new Date(deadlineMs).toISOString() }),
    attempt: options.attempt ?? 1,
    source,
  };
  return Object.freeze({ ...metadata, functionId, status: "started" as const });
}

export function completeRecord(
  record: InvocationRecord,
  outcome: InvocationOutcome,
  now: number,
): InvocationRecord {
  return Object.freeze({
    ...record,
    status: outcome,
    completedAt: new Date(now).toISOString(),
    durationMs: Math.max(0, now - Date.parse(record.startedAt)),
  });
}

export function calculateDeadline<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = import("./invoke-types.js").InvocationContext,
>(
  targetTimeout: number | undefined,
  options: InvokeOptions<Input, Output, Context>,
  parent: number | undefined,
  now: number,
): number | undefined {
  const timeouts = [targetTimeout, options.timeoutMs].filter(
    (value): value is number => value !== undefined,
  );
  for (const timeout of timeouts) {
    if (!Number.isFinite(timeout) || timeout < 0)
      throw new RangeError("timeoutMs must be finite and non-negative");
  }
  const deadlines = [parent, options.deadlineMs ?? options.deadline];
  if (timeouts.length > 0) deadlines.push(now + Math.min(...timeouts));
  for (const deadline of deadlines) {
    if (deadline !== undefined && !Number.isFinite(deadline)) {
      throw new RangeError("deadline must be a finite timestamp");
    }
  }
  return deadlines
    .filter((value): value is number => value !== undefined)
    .reduce<number | undefined>(
      (minimum, value) => (minimum === undefined ? value : Math.min(minimum, value)),
      undefined,
    );
}

export const defaultIdSource: InvocationIdSource = {
  next: (kind) => `${kind}-${crypto.randomUUID()}` as import("@zsys/contracts").ProtocolId,
};

export const defaultRunner: InvocationRunner = {
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
