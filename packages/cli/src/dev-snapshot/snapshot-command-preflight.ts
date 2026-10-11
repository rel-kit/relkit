/**
 * Starts watched current-member hashing before importing the prepared Effect graph.
 * This is only a speculative proof: the domain service still decodes the receipt,
 * verifies immutable artifacts, and accepts it only for the identical live epoch.
 */
import { readFileSync, statSync, watch } from "node:fs";
import { resolve } from "node:path";
import { findSnapshotMismatch } from "./snapshot-integrity-process.js";
import { isSnapshotEpochPathRelevant } from "./snapshot-epoch-path.js";
import type { SnapshotMember } from "./snapshot.types.js";
import type {
  SnapshotCommandPreflight,
  SnapshotEpochPreflight,
} from "./snapshot-preflight.types.js";

const GENERATION = /^sha256:[a-f0-9]{64}$/;

/** Returns an optional proof; every malformed or unavailable hint falls back safely. */
export function startSnapshotCommandPreflight(
  args: readonly string[],
  signal: AbortSignal,
): SnapshotCommandPreflight | undefined {
  let epoch: SnapshotEpochPreflight | undefined;
  try {
    const root = projectRoot(args);
    epoch = startEpoch(root);
    const pointer = readJson(root, ".relkit/dev/current.json", 1_024);
    const generation = recordString(pointer, "generation");
    if (!GENERATION.test(generation)) throw new Error("Invalid generation");
    const receipt = readJson(
      root,
      `.relkit/dev/generations/${generation.slice(7)}/receipt.json`,
      2_097_152,
    );
    const members = currentMembers(receipt);
    return {
      root,
      generation,
      startRevision: epoch.revision,
      epoch,
      mismatch: findSnapshotMismatch(root, members, 67_108_864, signal),
    };
  } catch {
    epoch?.close();
    return undefined;
  }
}

/** Resolves only the existing project-root flag needed by speculative work. */
function projectRoot(args: readonly string[]): string {
  const index = args.indexOf("--project-root");
  const value = index < 0 ? undefined : args[index + 1];
  if (index >= 0 && (value === undefined || value.startsWith("--"))) throw new Error();
  return resolve(value ?? process.cwd());
}

/** Opens one recursive witness before reading any member identity. */
function startEpoch(root: string): SnapshotEpochPreflight {
  const epoch = {
    root,
    revision: 0,
    failure: undefined,
    notify: undefined,
    watcher: undefined,
    close: () => undefined,
  } as unknown as SnapshotEpochPreflight;
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (filename !== null && !isSnapshotEpochPathRelevant(filename.toString())) return;
    epoch.revision += 1;
    epoch.notify?.();
  });
  watcher.on("error", (failure) => {
    epoch.failure = failure;
    epoch.notify?.();
  });
  let closed = false;
  epoch.watcher = watcher;
  epoch.close = () => {
    if (closed) return;
    closed = true;
    watcher.close();
  };
  return epoch;
}

/** Reads one bounded speculative JSON document; authoritative decoding happens later. */
function readJson(root: string, path: string, limit: number): unknown {
  const absolute = resolve(root, path);
  if (statSync(absolute).size > limit) throw new Error();
  return JSON.parse(readFileSync(absolute, "utf8"));
}

/** Extracts and deduplicates mutable source and checker members. */
function currentMembers(value: unknown): readonly SnapshotMember[] {
  if (!isRecord(value) || !isRecord(value.typecheckInputs)) throw new Error();
  const groups: readonly (readonly SnapshotMember[])[] = [
    memberArray(value.inputs),
    memberArray(value.typecheckInputs.files),
    ...installedDependencyMembers(value.dependencies),
  ];
  const unique = new Map<string, SnapshotMember>();
  for (const group of groups)
    for (const member of group) {
      const previous = unique.get(member.path);
      if (previous && (previous.bytes !== member.bytes || previous.hash !== member.hash))
        throw new Error();
      unique.set(member.path, member);
    }
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}

/** Prefixes only mutable installed dependencies; capsule copies are immutable artifacts. */
function installedDependencyMembers(value: unknown): readonly (readonly SnapshotMember[])[] {
  if (!Array.isArray(value)) throw new Error();
  return value.flatMap((dependency) => {
    if (!isRecord(dependency)) throw new Error();
    const root = recordString(dependency, "root");
    if (!root.startsWith("node_modules/")) return [];
    return [
      memberArray(dependency.members).map((member) => ({
        ...member,
        path: `${root}/${member.path}`,
      })),
    ];
  });
}

/** Performs bounded structural decoding before the stricter worker protocol. */
function memberArray(value: unknown): readonly SnapshotMember[] {
  if (!Array.isArray(value) || value.length > 20_000) throw new Error();
  return value.map((member) => {
    if (!isRecord(member)) throw new Error();
    const path = recordString(member, "path");
    const hash = recordString(member, "hash");
    if (!Number.isSafeInteger(member.bytes) || Number(member.bytes) < 0) throw new Error();
    return { path, hash, bytes: Number(member.bytes) };
  });
}

function recordString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string") throw new Error();
  return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
