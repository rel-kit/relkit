import type { JournalPage, ReadJournalRequest, WaitForJournalRequest } from "@relkit/agents";
import { checkpoint, ownedThread } from "./common.js";
import type { AgentStateStore } from "./storage.js";

export async function readJournal(
  store: AgentStateStore,
  request: ReadJournalRequest,
): Promise<JournalPage> {
  const state = await store.read();
  const local = ownedThread(state, request, request.threadId);
  const foreign =
    request.after.threadId !== request.threadId ||
    request.after.applicationId !== request.applicationId ||
    request.after.environment !== request.environment ||
    request.after.profile !== request.profile;
  const reset = request.after.providerEpoch !== state.providerEpoch;
  const after = Number(request.after.sequence);
  const future = after > local.sequence;
  if (foreign || reset || future) {
    return {
      records: [],
      checkpoint: checkpoint(state, request, request.threadId, local.sequence),
      hasMore: false,
      gap: foreign ? "foreign" : reset ? "provider-reset" : "future",
    };
  }
  let bytes = 0;
  const records = local.journal
    .filter((record) => Number(record.checkpoint.sequence) > after)
    .slice(0, request.limit)
    .filter((record) => {
      if (bytes + record.encodedBytes > request.maxEncodedBytes) return false;
      bytes += record.encodedBytes;
      return true;
    });
  const sequence = Number(records.at(-1)?.checkpoint.sequence ?? after);
  return {
    records,
    checkpoint: checkpoint(state, request, request.threadId, sequence),
    hasMore: local.journal.some((record) => Number(record.checkpoint.sequence) > sequence),
  };
}

export async function waitForJournal(
  store: AgentStateStore,
  request: WaitForJournalRequest,
  pollingMs: number,
): Promise<void> {
  while (Date.now() < request.deadlineMs) {
    if (request.signal.aborted) throw request.signal.reason;
    const page = await readJournal(store, {
      ...request,
      limit: 1,
      maxEncodedBytes: 256 * 1024,
    });
    if (page.gap !== undefined || page.records.length > 0) return;
    await sleep(Math.min(pollingMs, request.deadlineMs - Date.now()), request.signal);
  }
}

export function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, milliseconds));
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
