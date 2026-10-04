import type { JsonValue } from "@relkit/contracts";
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { runInspectorPromise as runExecutionPromise } from "../native-edge.js";
import { nativeAttempt, projectionAttempt, unwrapInspectorFailure } from "../native-edge.js";
import { inspectorNativeJobsExecution } from "./native.service.js";
import { authorizeJobs, jobBindings, operationContext } from "./services.js";
import { InspectorJobsError, type InspectorJobsBinding } from "./types.js";
import { identity, isRecord, safeJson, type ResolvedActiveGeneration } from "../shared.js";

/**
 * Lazily authorizes and dispatches a native control without introducing retry/replay.
 * @param generation - Active authoritative native-job generation.
 * @param request - HTTP operation identity, reason and cancellation signal.
 * @param runId - Native run identity.
 * @param action - Declared cancel or retry operation.
 * @returns A native receipt, or the established unsupported/conflict/not-found error.
 * @remarks Native job authorities own operation-ID idempotency. This adapter never
 * retries an irreversible command or evicts an authoritative receipt.
 */
export const controlJobRunEffect = Effect.fn("InspectorJobs.control")(
  function* (
    generation: ResolvedActiveGeneration,
    request: Request,
    runId: string,
    action: "cancel" | "retry",
  ) {
    const body = yield* nativeAttempt(() => readBody(request));
    const service =
      new URL(request.url).searchParams.get("service") ??
      (typeof body.service === "string" ? body.service : undefined);
    yield* nativeAttempt(() => authorizeJobs(generation, request, "control", service));
    const binding = yield* findBinding(generation, request, runId, service);
    if (service === undefined)
      yield* nativeAttempt(() => authorizeJobs(generation, request, "control", binding.service));
    const operationId =
      request.headers.get("x-relkit-operation-id") ??
      (typeof body.operationId === "string" ? body.operationId : crypto.randomUUID());
    if (operationId.length === 0 || operationId.length > 256)
      return yield* Effect.fail(
        new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 400),
      );
    const context = operationContext(generation, binding, "control", request);
    let receipt: unknown;
    if (action === "cancel") {
      const cancel = binding.cancel;
      if (cancel === undefined || binding.capabilities?.features?.cancel === false)
        return yield* Effect.fail(
          new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501),
        );
      receipt = yield* nativeAttempt(() =>
        cancel.call(
          binding,
          runId,
          operationId,
          typeof body.reason === "string" ? body.reason : undefined,
          context,
        ),
      ).pipe(Effect.mapError(controlFailure));
    } else {
      const retry = binding.retry;
      if (retry === undefined || binding.capabilities?.features?.retry === false)
        return yield* Effect.fail(
          new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_UNSUPPORTED", 501),
        );
      receipt = yield* nativeAttempt(() => retry.call(binding, runId, operationId, context)).pipe(
        Effect.mapError(controlFailure),
      );
    }
    return yield* projectionAttempt(() => controlResponse(generation, binding, receipt)).pipe(
      Effect.mapError(controlFailure),
    );
  },
  (effect) => observeExecution("inspector", "jobs.control", effect, () => ({ commands: 1 })),
);

/**
 * Dispatches one native command using the finite compatibility owner.
 * @param generation - Authorized active generation.
 * @param request - Native operation identity and cancellation signal.
 * @param runId - Native run identity.
 * @param action - Cancel or retry declaration.
 * @returns The redacted native receipt or existing public error.
 */
export function controlJobRun(
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
  action: "cancel" | "retry",
): Promise<JsonValue> {
  return runExecutionPromise(
    inspectorNativeJobsExecution,
    controlJobRunEffect(generation, request, runId, action),
  );
}

/**
 * Selectively projects the public receipt without native storage/provider internals.
 * @param generation - Authoritative generation identity.
 * @param binding - Native service supplying the receipt.
 * @param receipt - Native command receipt.
 * @returns A redacted response retaining service identity.
 */
function controlResponse(
  generation: ResolvedActiveGeneration,
  binding: InspectorJobsBinding,
  receipt: unknown,
): JsonValue {
  const value = safeJson({ ...identity(generation), receipt });
  return isRecord(value)
    ? ({
        ...value,
        service: binding.service,
        serviceGeneration: binding.serviceGeneration,
      } as JsonValue)
    : value;
}

/**
 * Searches native authorities sequentially because later reads depend on earlier misses.
 * @param generation - Active native authorities.
 * @param request - Native cancellation and privilege context.
 * @param runId - Requested run identity.
 * @param service - Optional authoritative service selection.
 * @returns The first matching authority, or existing unavailable/not-found errors.
 */
const findBinding = Effect.fn("InspectorJobs.findControlBinding")(function* (
  generation: ResolvedActiveGeneration,
  request: Request,
  runId: string,
  service: string | undefined,
) {
  const bindings = (yield* nativeAttempt(() => jobBindings(generation))).filter(
    (binding) => service === undefined || binding.service === service,
  );
  if (bindings.length === 0)
    return yield* Effect.fail(new InspectorJobsError("RELKIT_INSPECTOR_JOBS_UNAVAILABLE", 503));
  for (const binding of bindings) {
    const found = yield* nativeAttempt(() =>
      binding.get(runId, operationContext(generation, binding, "read", request)),
    ).pipe(Effect.match({ onSuccess: () => true, onFailure: () => false }));
    if (found) return binding;
  }
  return yield* Effect.fail(new InspectorJobsError("RELKIT_INSPECTOR_JOBS_NOT_FOUND", 404));
});

/**
 * Reads the legacy optional control body at the native JSON boundary.
 * @param request - Native HTTP body.
 * @returns An object, or the established empty-body fallback for malformed/absent input.
 */
async function readBody(request: Request): Promise<Record<string, JsonValue>> {
  try {
    const value: unknown = await request.json();
    if (isRecord(value)) return value as Record<string, JsonValue>;
  } catch {}
  return {};
}

/**
 * Maps native command failure without exposing provider details.
 * @param error - Native failure value.
 * @returns The existing Inspector error, or a public operation-conflict error.
 */
function controlFailure(error: unknown): InspectorJobsError {
  error = unwrapInspectorFailure(error);
  return error instanceof InspectorJobsError
    ? error
    : new InspectorJobsError("RELKIT_INSPECTOR_JOBS_OPERATION_INVALID", 409);
}
