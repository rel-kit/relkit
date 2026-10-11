/** Starts integrity work before loading the prepared Effect/supervisor graph. */
import { startSnapshotCommandPreflight } from "./snapshot-command-preflight.js";

/** Runs the prepared command while retaining the speculative watch through cleanup. */
export async function runPreparedDev(args: readonly string[], signal: AbortSignal) {
  const preflight = startSnapshotCommandPreflight(args, signal);
  try {
    const command = await import("./snapshot-command.js");
    return await command.runPreparedDev(args, signal, preflight);
  } finally {
    preflight?.epoch.close();
  }
}
