import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureOwnedDirectory } from "../state.js";
import {
  emptyAgentState,
  LOCAL_AGENT_STATE_VERSION,
  type LocalAgentState,
  type StoredReceipt,
} from "./state.js";

export interface AgentStateStore {
  read(): Promise<LocalAgentState>;
  update<Value>(
    change: (state: LocalAgentState) => readonly [LocalAgentState, Value],
  ): Promise<Value>;
}

export function createAgentStateStore(root: string): AgentStateStore {
  const owned = ensureOwnedDirectory(root);
  const path = join(owned, "agent-state.json");
  const lock = join(owned, ".agent-state.lock");
  const ready = withLock(lock, async () => {
    try {
      await readState(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeState(path, emptyAgentState());
    }
  });
  return {
    async read() {
      await ready;
      return readState(path);
    },
    async update(change) {
      await ready;
      return withLock(lock, async () => {
        const [next, value] = change(pruneReceipts(await readState(path)));
        await writeState(path, next);
        return value;
      });
    },
  };
}

function pruneReceipts(state: LocalAgentState): LocalAgentState {
  const now = Date.now();
  return {
    ...state,
    runReceipts: liveReceipts(state.runReceipts, now),
    controlReceipts: liveReceipts(state.controlReceipts, now),
    continuationReceipts: liveReceipts(state.continuationReceipts, now),
  };
}

function liveReceipts<Value>(
  receipts: Readonly<Record<string, StoredReceipt<Value>>>,
  now: number,
): Readonly<Record<string, StoredReceipt<Value>>> {
  return Object.fromEntries(
    Object.entries(receipts).filter(([, receipt]) => Date.parse(receipt.expiresAt) > now),
  );
}

async function readState(path: string): Promise<LocalAgentState> {
  const state = JSON.parse(await readFile(path, "utf8")) as LocalAgentState;
  if (state.version !== LOCAL_AGENT_STATE_VERSION || typeof state.providerEpoch !== "string") {
    throw new TypeError("Local agent state version is invalid.");
  }
  return state;
}

async function writeState(path: string, state: LocalAgentState): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function withLock<Value>(path: string, action: () => Promise<Value>): Promise<Value> {
  const deadline = Date.now() + 5_000;
  while (!(await claimLock(path))) {
    if (Date.now() >= deadline) throw new Error("Local agent state lock timed out.");
    await Bun.sleep(10);
  }
  try {
    return await action();
  } finally {
    await rmdir(path).catch(() => undefined);
  }
}

async function claimLock(path: string): Promise<boolean> {
  try {
    await mkdir(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      if (Date.now() - (await stat(path)).mtimeMs > 30_000)
        await rmdir(path).catch(() => undefined);
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
    }
    return false;
  }
}
