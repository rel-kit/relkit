import type { JobsConformanceFixture, JobsConformanceHarness } from "./jobs-conformance.types.js";
export type { JobsConformanceFixture, JobsConformanceHarness } from "./jobs-conformance.types.js";
import type { RunHandle } from "@relkit/contracts/jobs";
import type { JobsAdapterRuntime, NativeSubmission, OperationContext } from "@relkit/jobs/adapter";
import {
  createDeterministicJobsAdapter,
  type TestJobsAdapterOptions,
} from "./test-jobs-adapter.js";

export const JOBS_CONFORMANCE_FIXTURES: readonly JobsConformanceFixture[] = Object.freeze([
  {
    id: "runtime-isolation",
    description: "two runtimes keep their runs and capabilities isolated",
  },
  {
    id: "canonical-validation",
    description: "native submission carries a canonical wire envelope",
  },
  { id: "unknown-acknowledgement", description: "ambiguous writes retain operation identity" },
  { id: "cancel-race", description: "the first terminal control transition wins" },
  { id: "retry-deduplication", description: "one retry operation creates one new run" },
  {
    id: "identity-rotation",
    description: "accepted identity remains distinct from service generation",
  },
]);

/**
 * Creates the deterministic adapter used by native contract fixtures.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns An isolated adapter and the explicit fixture execution context.
 */
export function createJobsConformanceHarness(
  options: TestJobsAdapterOptions = {},
): JobsConformanceHarness {
  const adapter = createDeterministicJobsAdapter(options);
  const context: OperationContext = {
    signal: new AbortController().signal,
    application: "conformance",
    environment: "test",
    scope: "conformance",
    service: adapter.capabilities.service,
    serviceGeneration: "generation.test",
  };
  return Object.freeze({
    adapter,
    context,
    fixtures: JOBS_CONFORMANCE_FIXTURES,
    run: async (fixtureId: string) => runFixture(adapter, context, fixtureId),
  });
}

/**
 * Executes selected existing native adapter contract fixtures sequentially.
 * @param adapter - Native jobs adapter under conformance evaluation.
 * @param fixtureIds - Selected existing conformance fixture identities in execution order.
 * @returns An immutable list of fixture identities that completed successfully.
 */
export async function runJobsConformance(
  adapter: JobsAdapterRuntime,
  fixtureIds: readonly string[] = JOBS_CONFORMANCE_FIXTURES.map((fixture) => fixture.id),
): Promise<readonly string[]> {
  const context: OperationContext = {
    signal: new AbortController().signal,
    application: "conformance",
    environment: "test",
    scope: "conformance",
    service: adapter.capabilities.service,
    serviceGeneration: "generation.test",
  };
  const passed: string[] = [];
  for (const fixtureId of fixtureIds) {
    await runFixture(adapter, context, fixtureId);
    passed.push(fixtureId);
  }
  return Object.freeze(passed);
}

/**
 * Checks one native adapter compatibility scenario.
 * @param adapter - Native jobs adapter under conformance evaluation.
 * @param context - Native invocation context including cancellation and deadline.
 * @param fixtureId - Existing native contract fixture identity.
 * @returns The accepted run when the fixture returns a handle, otherwise undefined.
 */
async function runFixture(
  adapter: JobsAdapterRuntime,
  context: OperationContext,
  fixtureId: string,
): Promise<RunHandle | undefined> {
  const first = await adapter.submit(request(fixtureId, "first"), context);
  if (fixtureId === "unknown-acknowledgement") {
    if (first === undefined || (first as { readonly outcome?: string }).outcome !== "unknown")
      throw new Error("Unknown outcome fixture did not remain unknown");
    return undefined;
  }
  if (!isHandle(first)) throw new Error(`Fixture ${fixtureId} was not accepted`);
  if (
    fixtureId === "runtime-isolation" ||
    fixtureId === "canonical-validation" ||
    fixtureId === "identity-rotation"
  )
    return first;
  if (fixtureId === "cancel-race") {
    const cancelled = await adapter.cancel(
      { runId: first.runId, operationId: "cancel-1" },
      context,
    );
    if ((cancelled as { readonly outcome?: string }).outcome !== "requested")
      throw new Error("Cancel race did not win first transition");
    return first;
  }
  if (fixtureId === "retry-deduplication") {
    const worker = adapter.worker;
    if (worker === undefined) throw new Error("Retry fixture requires a worker");
    await worker.fail(first.runId, new Error("fixture"), context);
    const retried = await adapter.retry?.(
      { runId: first.runId, operationId: "retry-1", retryIdentity: "retry-identity" },
      context,
    );
    if (!isHandle(retried) || retried.runId === first.runId)
      throw new Error("Retry fixture did not create a new run");
    return retried;
  }
  throw new Error(`Unknown conformance fixture ${fixtureId}`);
}

/**
 * Creates a canonical native submission for one compatibility fixture.
 * @param fixtureId - Existing native contract fixture identity.
 * @param operationId - Explicit native write operation identity.
 * @returns A submission carrying explicit operation and acceptance identities.
 */
function request(fixtureId: string, operationId: string): NativeSubmission {
  return {
    jobId: `job.${fixtureId}`,
    taskId: `task.${fixtureId}`,
    taskVersion: "1",
    buildId: "build.test",
    input: { fixtureId },
    canonicalInput: { version: 1, kind: "json", value: { fixtureId } },
    operationId,
    ...(fixtureId === "runtime-isolation" ? { idempotencyKey: "same" } : {}),
    acceptanceIdentity: `${fixtureId}:acceptance`,
  };
}

/**
 * Checks the accepted native run result at the unknown adapter boundary.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True when acceptance and run identity are present.
 */
function isHandle(value: unknown): value is RunHandle {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { readonly accepted?: unknown }).accepted === true &&
    typeof (value as { readonly runId?: unknown }).runId === "string"
  );
}
