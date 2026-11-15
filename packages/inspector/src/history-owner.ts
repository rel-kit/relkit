/**
 * Records which Inspector holds a project's history and where it listens, so a second Inspector
 * that cannot open the history can say who has it. The record sits beside the history, is private
 * to the user, and names an address only while the process that wrote it is alive.
 */
import { readFileSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import type { InspectorOptions } from "./options.types.js";

const RECORD_FILE = ".inspector-owner.json";

/** The Inspector that holds a history directory. */
export interface HistoryOwner {
  readonly pid: number;
  /** Origin of its interface, for example `http://127.0.0.1:3210`. */
  readonly url: string;
}

/**
 * Writes this process as the history's owner; a failure leaves no record and nothing else changes.
 * @param root - History directory, which exists once the history is open.
 * @param options - Launch options holding the interface's host and port.
 * @returns An effect that always succeeds.
 */
export const publishHistoryOwner = Effect.fn("Inspector.publishHistoryOwner")(function* (
  root: string,
  options: InspectorOptions,
) {
  yield* Effect.promise(async () => {
    try {
      const owner: HistoryOwner = { pid: process.pid, url: listenOrigin(options) };
      await writeFile(join(root, RECORD_FILE), JSON.stringify(owner), { mode: 0o600 });
    } catch {
      // The record only improves a message; the history works without it.
    }
  });
});

/**
 * Removes the record when this process wrote it.
 * @param root - History directory.
 * @returns An effect that always succeeds.
 */
export const removeHistoryOwner = Effect.fn("Inspector.removeHistoryOwner")(function* (
  root: string,
) {
  yield* Effect.promise(async () => {
    try {
      if (readOwner(root)?.pid === process.pid) await unlink(join(root, RECORD_FILE));
    } catch {
      // A record left behind is ignored once its process is gone.
    }
  });
});

/**
 * Reads the record of another live Inspector.
 * @param root - History directory.
 * @returns The owner, or undefined when there is no record, it is malformed, it names this
 *   process, or its process is gone.
 */
export const readHistoryOwner = Effect.fn("Inspector.readHistoryOwner")(function* (root: string) {
  return yield* Effect.sync(() => {
    try {
      const owner = readOwner(root);
      return owner !== undefined && owner.pid !== process.pid && alive(owner.pid)
        ? owner
        : undefined;
    } catch {
      return undefined;
    }
  });
});

/** Reads and validates the record file; only a plain HTTP origin is accepted as an address. */
function readOwner(root: string): HistoryOwner | undefined {
  const value: unknown = JSON.parse(readFileSync(join(root, RECORD_FILE), "utf8"));
  if (typeof value !== "object" || value === null) return undefined;
  const { pid, url } = value as Record<string, unknown>;
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1) return undefined;
  if (typeof url !== "string") return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || parsed.username !== "" || parsed.password !== "")
    return undefined;
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return undefined;
  return { pid, url: parsed.origin };
}

/** Whether a process with this ID exists; a process owned by another user still counts. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** The address a browser on this machine opens; a wildcard bind answers on loopback. */
function listenOrigin(options: InspectorOptions): string {
  const host = ["0.0.0.0", "::", "::1"].includes(options.hostname)
    ? options.hostname === "::1"
      ? "[::1]"
      : "127.0.0.1"
    : options.hostname;
  return `http://${host}:${options.port}`;
}
