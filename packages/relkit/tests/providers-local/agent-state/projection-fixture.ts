/** Prepares original root and nested journal events for durable projection tests. */
import { setup, appendExecution, limits } from "./fixture.js";
import { owner, operationId, future } from "./identity.js";

/**
 * Creates the exact native projection owner and physical claim.
 * @returns The owned provider and admitted state used by the following scenario phase.
 */
export async function projectionFixture() {
  const { provider, root, scope } = await setup();
  const now = new Date().toISOString();
  const thread = await provider.createThread({
    ...scope,
    operationId: operationId(10),
    threadId: "projection-thread",
    semanticDigest: "projection-thread",
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(11),
    semanticDigest: "projection-run",
    threadId: thread.threadId,
    owner: owner(),
    input: { message: "go" },
    inputDigest: "projection-input",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId: thread.threadId,
    runId: run.runId,
    workerId: "projection-worker",
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const childScope = ["tools:delegate", "model:one"];
  return { provider, root, scope, now, thread, run, claim, childScope };
}

/**
 * Appends the original root values in native sequence order.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns After the scenario persistence and behavior assertions complete.
 */
export async function appendRootValues(fixture: Awaited<ReturnType<typeof projectionFixture>>) {
  const { provider, scope, thread, run, claim, now } = fixture;
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 12, {
    nativeSequence: 1,
    kind: "values",
    scope: [],
    occurredAt: now,
    value: { todos: ["root"], phase: "planning" },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 13, {
    nativeSequence: 2,
    kind: "values",
    scope: [],
    occurredAt: now,
    value: { phase: "working" },
  });
}

/**
 * Appends nested lifecycle and values while retaining unscoped event isolation.
 * @param fixture - Owned provider, scope and previously admitted scenario state.
 * @returns After the scenario persistence and behavior assertions complete.
 */
export async function appendNestedValues(fixture: Awaited<ReturnType<typeof projectionFixture>>) {
  const { provider, scope, thread, run, claim, childScope, now } = fixture;
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 14, {
    nativeSequence: 3,
    kind: "lifecycle",
    scope: childScope,
    occurredAt: now,
    agent: "researcher",
    parent: { kind: "tool", toolCallId: "delegate", toolId: "task" },
    node: "model_request",
    value: { event: "started" },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 15, {
    nativeSequence: 4,
    kind: "values",
    scope: childScope,
    occurredAt: now,
    value: { todos: ["child"] },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 16, {
    nativeSequence: 5,
    kind: "values",
    scope: ["unknown-without-lifecycle"],
    occurredAt: now,
    value: { hidden: false },
  });
  await appendExecution(provider, scope, thread.threadId, run.runId, claim, 17, {
    nativeSequence: 6,
    kind: "lifecycle",
    scope: childScope,
    occurredAt: now,
    value: { event: "completed" },
  });
}
