import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureOwnedDirectory } from "../state.js";
import {
  emptyRealtimeState,
  LOCAL_REALTIME_STATE_VERSION,
  type LocalRealtimeState,
  type StoredAppendReceipt,
} from "./state.js";

export interface RealtimeStateStore {
  readonly read: () => Promise<LocalRealtimeState>;
  readonly update: <Value>(
    change: (state: LocalRealtimeState) => {
      readonly state: LocalRealtimeState;
      readonly value: Value;
    },
  ) => Promise<Value>;
}

export function createRealtimeStateStore(root: string): RealtimeStateStore {
  const owned = ensureOwnedDirectory(root);
  const statePath = join(owned, "realtime.json");
  const lockPath = join(owned, ".realtime.lock");
  const ready = initializeState(statePath, lockPath);
  return {
    read: async () => {
      await ready;
      return readState(statePath);
    },
    update: async (change) => {
      await ready;
      return withLock(lockPath, async () => {
        const current = pruneReceipts(await readState(statePath));
        const result = change(current);
        await writeState(statePath, result.state);
        return result.value;
      });
    },
  };
}

function pruneReceipts(state: LocalRealtimeState): LocalRealtimeState {
  const now = Date.now();
  const receipts = Object.fromEntries(
    Object.entries(state.receipts).filter(([, receipt]) => Date.parse(receipt.expiresAt) > now),
  ) as Readonly<Record<string, StoredAppendReceipt>>;
  return { ...state, receipts };
}

async function initializeState(statePath: string, lockPath: string): Promise<void> {
  await withLock(lockPath, async () => {
    try {
      await readState(statePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeState(statePath, emptyRealtimeState());
    }
  });
}

async function readState(path: string): Promise<LocalRealtimeState> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as LocalRealtimeState;
    if (value.version !== LOCAL_REALTIME_STATE_VERSION || typeof value.providerEpoch !== "string") {
      throw new TypeError("Local realtime state version is invalid.");
    }
    return value;
  } catch (error) {
    throw error;
  }
}

async function writeState(path: string, state: LocalRealtimeState): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function withLock<Value>(path: string, action: () => Promise<Value>): Promise<Value> {
  const deadline = Date.now() + 5_000;
  while (!(await claimLock(path))) {
    if (Date.now() >= deadline) throw new Error("Local realtime state lock timed out.");
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
      const age = Date.now() - (await stat(path)).mtimeMs;
      if (age > 30_000) await rmdir(path).catch(() => undefined);
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
    }
    return false;
  }
}
