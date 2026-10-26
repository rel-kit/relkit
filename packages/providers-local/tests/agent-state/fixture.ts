/** Owns isolated native state fixtures, their cleanup, and exact scoped journal requests for provider tests. */
import { baseScope, owner, operationId, future, digest } from "./identity.js";
import { afterEach } from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  AgentExecutionEvent,
  AgentRequestScope,
  AgentStateLimits,
  AgentStateProvider,
  ExecutionClaim,
} from "@relkit/contracts";

import { createLocalAgentStateProvider } from "../../src/agent-state/provider.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true }))));

export const limits: AgentStateLimits = {
  maxSnapshotBytes: 4 * 1024 * 1024,
  maxHistoryPageBytes: 4 * 1024 * 1024,
  maxJournalRecordBytes: 256 * 1024,
  maxJournalBytesPerThread: 16 * 1024 * 1024,
  maxStateBytesPerApplication: 1024 * 1024 * 1024,
  maxThreadsPerPrincipal: 100,
  maxActiveRunsPerPrincipal: 4,
  maxActiveRunsPerApplication: 100,
  terminalReserveBytes: 32 * 1024,
  terminalReserveRecords: 4,
};

/**
 * Acquires an isolated provider root and registers its test cleanup.
 * @returns The provider, owned temporary root and matching caller scope.
 */
export async function setup() {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-state-"));
  roots.push(root);
  const provider = createLocalAgentStateProvider(root, { pollingMs: 50 });
  return { provider, root, scope: baseScope(await provider.getEpoch()) };
}

/**
 * Persists the exact execution event through the native journal boundary.
 * @param provider - Provider owning the scenario state directory.
 * @param scope - Caller identity tied to the fixture provider epoch.
 * @param threadId - Stable thread identity owned by this scenario.
 * @param runId - Previously admitted run whose journal is under test.
 * @param claim - Current fenced execution ownership for the journal append.
 * @param seed - Millisecond offset distinguishing scenario operation IDs.
 * @param event - Exact execution event persisted and later projected by the scenario.
 * @returns The journal append receipt after physical persistence completes.
 */
export function appendExecution(
  provider: AgentStateProvider,
  scope: AgentRequestScope,
  threadId: string,
  runId: string,
  claim: ExecutionClaim,
  seed: number,
  event: AgentExecutionEvent,
) {
  return provider.appendJournal({
    ...scope,
    threadId,
    runId,
    claim,
    operationId: operationId(seed),
    semanticDigest: digest(event),
    record: {
      recordId: `event-${seed}`,
      runId,
      kind: "event",
      publicValue: event,
      encodedBytes: 100,
      createdAt: event.occurredAt,
    },
    limits,
  });
}

/**
 * Creates, claims and suspends an owned run for continuation scenarios.
 * @param provider - Provider owning the scenario state directory.
 * @param scope - Caller identity tied to the fixture provider epoch.
 * @param threadId - Stable thread identity owned by this scenario.
 * @param seed - Millisecond offset distinguishing scenario operation IDs.
 * @returns The admitted run identity and its persisted waiting receipt.
 */
export async function createWaitingRun(
  provider: AgentStateProvider,
  scope: AgentRequestScope,
  threadId: string,
  seed: number,
) {
  const now = new Date().toISOString();
  await provider.createThread({
    ...scope,
    operationId: operationId(seed),
    threadId,
    semanticDigest: `thread-${seed}`,
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operationId(seed + 1),
    semanticDigest: `run-${seed}`,
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(30),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId,
    runId: run.runId,
    workerId: `worker-${seed}`,
    generationId: "generation-a",
    expiresAt: future(1),
  });
  const receipt = await provider.suspendRun({
    ...scope,
    operationId: operationId(seed + 2),
    threadId,
    runId: run.runId,
    claim,
    waiting: {
      runId: run.runId,
      response: { type: "boolean" },
      requests: [{ node: "review", response: { type: "boolean" } }],
    },
    suspendedAt: now,
  });
  return { runId: run.runId, waiting: receipt.waiting };
}
