import { getDescriptorIdentity, unknownSchema } from "@relkit/invocation";
import type {
  InvocationIdSource,
  InvocationMetadata,
  InvocationOutcome,
  InvocationRecord,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";
export {
  assertSource,
  callHook,
  defaultIdSource,
  defaultRunner,
  linkSignals,
  makeContext,
  unknownSchema,
  validated,
  validateDeclaredError,
} from "@relkit/invocation";

/** Resolve a canonical generation target or a schema-backed manifest handler.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns The verified target or a schema-backed native manifest target.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function resolveTarget<Input, Output, Context extends { readonly signal: AbortSignal }>(
  options: InvokeOptions<Input, Output, Context>,
): InvocationTarget<Input, Output, Context> {
  if (options.target !== undefined) {
    const registered = options.registry?.targets[getDescriptorIdentity(options.target)];
    return (registered ?? options.target) as InvocationTarget<Input, Output, Context>;
  }
  if (options.registry === undefined || options.functionId === undefined) {
    throw new TypeError("Invocation target is required");
  }
  const handler = options.registry.get(options.functionId);
  if (handler === undefined)
    throw new TypeError(`Function handler is not registered: ${options.functionId}`);
  const target = options.registry.targets[options.functionId];
  if (target !== undefined) return target as unknown as InvocationTarget<Input, Output, Context>;
  return {
    id: options.functionId,
    input: options.inputSchema ?? unknownSchema,
    output: options.outputSchema ?? unknownSchema,
    ...(options.errors === undefined ? {} : { errors: options.errors }),
    handler: handler as InvocationTarget<Input, Output, Context>["handler"],
  };
}

/** Validate publication declarations and preserve the descriptor's bound identity.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns The identity-bound target; malformed publications throw TypeError.
 * @param target - Declared target whose schema and metadata govern execution.
 */
export function canonicalTarget<Input, Output, Context extends { readonly signal: AbortSignal }>(
  target: InvocationTarget<Input, Output, Context>,
): InvocationTarget<Input, Output, Context> {
  const id = getDescriptorIdentity(target);
  for (const [eventId, event] of Object.entries(target.publications ?? {})) {
    if (!target.publishes?.includes(eventId) || (event.ref?.id ?? event.id) !== eventId) {
      throw new TypeError(
        `Function "${id}" has an undeclared publication "${eventId}"; declare its exact ID in publishes.`,
      );
    }
  }
  return target.id === id ? target : { ...target, id };
}

/** Freeze shared invocation identity, ancestry and deadline metadata.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns An immutable started invocation record.
 * @param functionId - Stable function identity used for generation lookup.
 * @param source - Explicit native source or source collection.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param traceId - Current shared trace identity.
 * @param deadlineMs - Optional absolute deadline in milliseconds.
 * @param now - Current timestamp in milliseconds.
 * @param idSource - Shared trace, span and invocation identity allocator.
 * @param serviceId - Optional owning service identity.
 */
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
  serviceId?: string,
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
    ...(serviceId === undefined ? {} : { serviceId }),
    ...(options.taskMetadata === undefined ? {} : options.taskMetadata),
  };
  return Object.freeze({ ...metadata, functionId, status: "started" as const });
}

/** Create a terminal record with elapsed duration while preserving start metadata.
 * @returns An immutable terminal record with non-negative duration.
 * @param record - Immutable invocation identity and start metadata.
 * @param outcome - Terminal status retained in the immutable completion record.
 * @param now - Current timestamp in milliseconds.
 */
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

/** Choose the earliest parent, absolute or relative invocation deadline.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns The earliest valid absolute deadline, or undefined without a limit.
 * @param targetTimeout - Optional target timeout in milliseconds from invocation start.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param parent - Optional absolute parent deadline in epoch milliseconds.
 * @param now - Current timestamp in milliseconds.
 */
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
