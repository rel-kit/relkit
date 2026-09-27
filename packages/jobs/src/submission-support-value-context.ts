import type { TracePropagation } from "@relkit/contracts";
import {
  currentInvocationScope,
  currentTaskAncestry,
  currentTracePropagation,
} from "@relkit/invocation";

/** Reads the parent invocation's correlation identity.
 * @returns Parent correlation ID when present.
 * @example currentCorrelation();
 */
export function currentCorrelation(): string | undefined {
  const scope = currentInvocationScope() as
    { readonly parent?: { readonly correlationId?: string } } | undefined;
  return scope?.parent?.correlationId;
}

/** Extends current trace propagation with an optional correlation identity.
 * @param correlationId - Caller or inherited correlation ID.
 * @returns Frozen propagation when available.
 * @example propagationFor("request-1");
 */
export function propagationFor(correlationId: string | undefined): TracePropagation | undefined {
  const propagation = currentTracePropagation();
  return propagation === undefined || correlationId === undefined
    ? propagation
    : Object.freeze({ ...propagation, correlationId });
}

/** Reads the current parent task run from invocation ancestry.
 * @returns Parent run ID when present.
 * @example currentTaskRunId();
 */
export function currentTaskRunId(): string | undefined {
  return currentTaskAncestry()?.runId;
}
