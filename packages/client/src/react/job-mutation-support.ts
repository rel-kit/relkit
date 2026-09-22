import type { PendingOperationMetadata } from "@relkit/contracts";
import { ORPCError } from "../index.js";
import { readRunId } from "./job-hooks-support.js";
import type { RelkitClientRuntime } from "./context.js";
import { forgetPending, jobUnknownOutcome, updatePending } from "./pending.js";
import { RelkitWriteError } from "./write-error.js";

export function writableScope(
  runtime: RelkitClientRuntime,
): NonNullable<RelkitClientRuntime["scope"]> {
  if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identity === undefined) {
    throw new RelkitWriteError("not-sent", `Relkit client is not ready (${runtime.status})`);
  }
  return runtime.scope;
}

export function settlePending(
  scopeKey: string,
  pending: PendingOperationMetadata,
  error: unknown,
): void {
  const unknown = jobUnknownOutcome(error);
  if (unknown !== undefined) {
    updatePending(scopeKey, {
      ...pending,
      state: "unknown",
      ...(unknown.idempotencyKey === undefined ? {} : { idempotencyKey: unknown.idempotencyKey }),
      recovery: unknown.recovery,
    });
  } else if (error instanceof ORPCError) {
    forgetPending(scopeKey, pending.operationId);
  } else {
    updatePending(scopeKey, { ...pending, state: "unknown" });
  }
}

export function controlReferences(input: unknown): { readonly runId?: string } {
  const runId = readRunId(input);
  return runId === undefined ? {} : { runId };
}

export function offline(): boolean {
  return (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false;
}
