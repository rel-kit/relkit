/**
 * Owns the bounded Bun workers used for large startup integrity inventories.
 * Cancellation terminates and reaps every process; output is checked against the
 * exact requested path order before it returns to the snapshot domain service.
 */
import { fileURLToPath } from "node:url";
import type { SnapshotMember } from "./snapshot.types.js";

const WORKERS = 2;

/** Hashes a large inventory across a bounded joined worker group. */
export async function hashSnapshotMembers(
  root: string,
  paths: readonly string[],
  limit: number,
  signal: AbortSignal,
): Promise<readonly SnapshotMember[]> {
  const worker = fileURLToPath(new URL("./snapshot-hash-worker.js", import.meta.url));
  const partitions = partition(paths, WORKERS);
  const children = partitions.map((members) =>
    Bun.spawn([process.execPath, worker, root, String(limit)], {
      cwd: root,
      env: process.env,
      stdin: new Blob([JSON.stringify(members)]),
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const abort = () => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const outputs = await Promise.all(
      children.map(async (child, index) => {
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        if (code !== 0) throw new Error(stderr.trim() || "Snapshot verification worker failed.");
        return decodeMembers(stdout, partitions[index] ?? []);
      }),
    );
    return outputs.flat();
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    await Promise.all(children.map((child) => child.exited));
  }
}

/** Hashes every expected member and returns only the first divergent caller index. */
export async function findSnapshotMismatch(
  root: string,
  members: readonly SnapshotMember[],
  limit: number,
  signal: AbortSignal,
): Promise<number | undefined> {
  const worker = fileURLToPath(new URL("./snapshot-hash-worker.js", import.meta.url));
  const partitions = partition(members, WORKERS);
  const children = partitions.map((partition) =>
    Bun.spawn([process.execPath, worker, root, String(limit), "verify"], {
      cwd: root,
      env: process.env,
      stdin: new Blob([
        JSON.stringify(partition.map((member) => [member.path, member.bytes, member.hash])),
      ]),
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const abort = () => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const mismatches = await Promise.all(
      children.map(async (child, partitionIndex) => {
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        if (code !== 0) throw new Error(stderr.trim() || "Snapshot verification worker failed.");
        const local = Number(stdout);
        const partition = partitions[partitionIndex] ?? [];
        if (!Number.isSafeInteger(local) || local < -1 || local >= partition.length)
          throw new Error("Invalid worker mismatch output.");
        if (local < 0) return undefined;
        return (
          partitions.slice(0, partitionIndex).reduce((sum, value) => sum + value.length, 0) + local
        );
      }),
    );
    return mismatches
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b)[0];
  } finally {
    signal.removeEventListener("abort", abort);
    abort();
    await Promise.all(children.map((child) => child.exited));
  }
}

/** Splits sorted caller order into contiguous deterministic process partitions. */
function partition<T>(paths: readonly T[], count: number): readonly (readonly T[])[] {
  const size = Math.ceil(paths.length / count);
  return Array.from({ length: count }, (_, index) =>
    paths.slice(index * size, (index + 1) * size),
  ).filter((members) => members.length > 0);
}

/** Accepts only complete safe identities for the exact worker partition. */
function decodeMembers(source: string, paths: readonly string[]): readonly SnapshotMember[] {
  const value: unknown = JSON.parse(source);
  if (!Array.isArray(value) || value.length !== paths.length)
    throw new Error("Invalid worker output.");
  return value.map((entry, index) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      (entry as SnapshotMember).path !== paths[index] ||
      !Number.isSafeInteger((entry as SnapshotMember).bytes) ||
      typeof (entry as SnapshotMember).hash !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test((entry as SnapshotMember).hash)
    )
      throw new Error("Invalid worker identity.");
    return entry as SnapshotMember;
  });
}
