/** Owns isolated native state fixtures, their cleanup, and exact scoped journal requests for provider tests. */
import { scopeFor, owner, operation, future } from "./identity.js";
import { afterEach } from "vitest";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRequestScope, AgentStateLimits } from "@relkit/contracts";

import {
  createAgentStateProviderFromStore,
  createLocalAgentStateProvider,
} from "../../src/agent-state/provider.js";
import { createAgentStateStore, type AgentStateStore } from "../../src/agent-state/storage.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))),
);

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
 * Acquires an owned provider and one-shot transactional failure injector.
 * @param threadId - Stable thread identity owned by this scenario.
 * @returns The owned provider, thread identity, root, scope and fault controller.
 */
export async function fixture(threadId: string) {
  const root = await mkdtemp(join(tmpdir(), "relkit-agent-failure-"));
  roots.push(root);
  const fault = faultingStore(createAgentStateStore(root));
  const provider = createAgentStateProviderFromStore(fault.store, 50);
  const scope = scopeFor(await provider.getEpoch());
  return { root, threadId, fault, provider, scope };
}

/**
 * Loads the owned thread using the fixture snapshot byte bound.
 * @param provider - Provider owning the scenario state directory.
 * @param scope - Caller identity tied to the fixture provider epoch.
 * @param threadId - Stable thread identity owned by this scenario.
 * @returns The public thread snapshot after native recovery and bounded projection.
 */
export function load(
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  scope: AgentRequestScope,
  threadId: string,
) {
  return provider.loadThread({ ...scope, threadId, maxEncodedBytes: limits.maxSnapshotBytes });
}

/**
 * Creates a thread and acquires a physical execution claim for its first run.
 * @param provider - Provider owning the scenario state directory.
 * @param scope - Caller identity tied to the fixture provider epoch.
 * @param threadId - Stable thread identity owned by this scenario.
 * @param seed - Millisecond offset distinguishing scenario operation IDs.
 * @returns The admitted run identity and current physical execution claim.
 */
export async function startRun(
  provider: ReturnType<typeof createLocalAgentStateProvider>,
  scope: AgentRequestScope,
  threadId: string,
  seed: number,
) {
  const now = new Date().toISOString();
  await provider.createThread({
    ...scope,
    operationId: operation(seed),
    threadId,
    semanticDigest: `thread-${seed}`,
    now,
    limits,
  });
  const run = await provider.acceptRun({
    ...scope,
    operationId: operation(seed + 1),
    semanticDigest: `run-${seed}`,
    threadId,
    owner: owner(),
    input: null,
    inputDigest: "null",
    acceptedAt: now,
    receiptExpiresAt: future(),
    limits,
  });
  const claim = await provider.claimRun({
    ...scope,
    threadId,
    runId: run.runId,
    workerId: `worker-${seed}`,
    generationId: "generation-a",
    expiresAt: future(),
  });
  return { runId: run.runId, claim };
}

/**
 * Constructs the exact waiting contract for the admitted fixture run.
 * @param scope - Caller identity tied to the fixture provider epoch.
 * @param threadId - Stable thread identity owned by this scenario.
 * @param active - Admitted run and physical execution claim to suspend.
 * @param seed - Millisecond offset distinguishing scenario operation IDs.
 * @returns A suspension request retaining the exact run, claim and waiting schema.
 */
export function suspension(
  scope: AgentRequestScope,
  threadId: string,
  active: Awaited<ReturnType<typeof startRun>>,
  seed: number,
) {
  return {
    ...scope,
    operationId: operation(seed),
    threadId,
    runId: active.runId,
    claim: active.claim,
    waiting: {
      runId: active.runId,
      response: { type: "boolean" },
      requests: [{ node: "review", response: { type: "boolean" } }],
    },
    suspendedAt: new Date().toISOString(),
  } as const;
}

/**
 * Injects one failure before or after a real transactional update.
 * @param base - Real transactional store wrapped by the one-shot failure injector.
 * @returns A native store facade and a one-shot before/after fault selector.
 */
export function faultingStore(base: AgentStateStore) {
  let next: "before" | "after" | undefined;
  return {
    store: {
      read: base.read,
      async update(change) {
        const phase = next;
        next = undefined;
        if (phase === "before") throw new Error("injected-before");
        const value = await base.update(change);
        if (phase === "after") throw new Error("injected-after");
        return value;
      },
    } satisfies AgentStateStore,
    failNext(phase: "before" | "after") {
      next = phase;
    },
  };
}
