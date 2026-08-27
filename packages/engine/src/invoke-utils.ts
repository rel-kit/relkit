import {
  assertSource,
  callHook,
  defaultIdSource,
  defaultRunner,
  getDescriptorIdentity,
  linkSignals,
  makeContext,
  unknownSchema,
  validated,
  validateDeclaredError,
} from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
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

export function canonicalTarget<Input, Output, Context extends { readonly signal: AbortSignal }>(
  target: InvocationTarget<Input, Output, Context>,
): InvocationTarget<Input, Output, Context> {
  const id = getDescriptorIdentity(target);
  return target.id === id ? target : { ...target, id };
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
