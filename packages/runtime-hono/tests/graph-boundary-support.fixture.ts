/** Waits for settled RPC status and reads actual journals with the original identity scope. */
import { setTimeout as sleep } from "node:timers/promises";
import { type AgentStateProvider } from "@relkit/agents";
import { createOperationId } from "@relkit/realtime";
import { digest } from "../src/agent-rpc-support.ts";

export function start(client: any, agentId: string, threadId: string) {
  return client["relkit.agent.run"]({
    agentId,
    threadId,
    operationId: createOperationId(),
    kind: "run",
    payload: { orderId: "42" },
  });
}

export function resume(
  client: any,
  agentId: string,
  threadId: string,
  waitingRevision: string,
  operationId = createOperationId(),
) {
  return client["relkit.agent.run"]({
    agentId,
    threadId,
    operationId,
    kind: "run",
    resume: true,
    waitingRevision,
    payload: true,
  });
}

export async function waitForStatus(
  client: any,
  agentId: string,
  threadId: string,
  status: string,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const snapshot = await client["relkit.agent.load"]({ agentId, threadId });
      if (snapshot.thread.status === status) return snapshot;
    } catch (cause) {
      lastError = cause;
    }
    await sleep(10);
  }
  throw new Error(`Agent did not reach ${status}.`, { cause: lastError });
}

export async function recordKinds(provider: AgentStateProvider, snapshot: any, agentId: string) {
  const page = await provider.readJournal({
    ...scope(snapshot, agentId),
    threadId: snapshot.thread.threadId,
    after: { ...snapshot.checkpoint, sequence: "0" },
    limit: 100,
    maxEncodedBytes: 1024 * 1024,
  });
  return page.records.map((record) => record.kind);
}

export function scope(snapshot: any, agentId: string) {
  return {
    applicationId: "fixture",
    environment: "test",
    profile: "default",
    providerEpoch: snapshot.providerEpoch,
    agentId,
    ownerScope: "viewer",
    identityScope: "viewer",
    sessionEpoch: "session",
    authorizationGrantId: digest({
      identity: { identityScope: "viewer", sessionEpoch: "session" },
      agentId,
    }),
  };
}

export function isTerminal(kind: string) {
  return kind === "terminal";
}

export function isInterruption(kind: string) {
  return kind === "interruption";
}

export async function contextual<T>(label: string, operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (cause) {
    throw new Error(label, { cause });
  }
}
