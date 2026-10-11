/**
 * Copies Bun's consumed installed inputs into the immutable development capsule.
 * Physical linked-workspace roots never enter the receipt; content-addressed
 * package directories remain portable and are verified with the other artifacts.
 */
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import type { FileSystemCapabilities } from "../services/filesystem.types.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotInstalledPackage } from "./snapshot-dependencies.schemas.js";
import { decodeSnapshotJson } from "./snapshot-json.js";
import { SnapshotPath } from "./snapshot.schemas.js";
import { snapshotDigest, sameSnapshotMembers } from "./snapshot-fingerprint.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { SnapshotDependency } from "./snapshot.types.js";

interface PackageSource {
  readonly root: string;
  readonly name: string;
  readonly version: string;
  readonly members: Set<string>;
}

/** Stages every installed bundle input beneath one portable capsule root. */
export const stageSnapshotDependencies = Effect.fn("DevSnapshot.stageDependencies")(function* (
  files: SnapshotFileOperations,
  writes: FileSystemCapabilities,
  projectRoot: string,
  capsuleRoot: string,
  nativePaths: readonly string[],
) {
  const groups = new Map<string, PackageSource>();
  const roots = new Map<string, string>();
  for (const nativePath of nativePaths) {
    const absolute = isAbsolute(nativePath) ? nativePath : resolve(projectRoot, nativePath);
    const local = portableRelative(projectRoot, absolute);
    if (local !== undefined) continue;
    const packageRoot = yield* packageRootFor(writes, absolute, roots);
    const member = portableRelative(packageRoot, absolute);
    if (member === undefined || !Schema.is(SnapshotPath)(member))
      return yield* ineligible("dependencies.packagePath");
    if (isEnvironment(member)) return yield* ineligible("dependencies.environment");
    let group = groups.get(packageRoot);
    if (group === undefined) {
      const identity = yield* readIdentity(writes, packageRoot);
      group = { root: packageRoot, ...identity, members: new Set(["package.json"]) };
      groups.set(packageRoot, group);
    }
    group.members.add(member);
  }
  if (groups.size > 2_048) return yield* ineligible("dependencies.packageBound");
  const staging = join(capsuleRoot, ".dependency-stage");
  yield* writes.mkdir(staging);
  const dependencies = yield* Effect.forEach(
    [...groups.values()].sort((left, right) => left.root.localeCompare(right.root)),
    (group, index) => stagePackage(files, writes, capsuleRoot, staging, index, group),
    { concurrency: 4 },
  );
  yield* writes.remove(staging);
  return [
    ...new Map(dependencies.map((dependency) => [dependency.root, dependency])).values(),
  ].sort((left, right) => left.root.localeCompare(right.root));
});

/** Copies and hashes one package before promoting it to its content address. */
const stagePackage = Effect.fn("DevSnapshot.stageDependencyPackage")(function* (
  files: SnapshotFileOperations,
  writes: FileSystemCapabilities,
  capsuleRoot: string,
  staging: string,
  index: number,
  group: PackageSource,
) {
  const temporary = join(staging, String(index));
  const members = [...group.members]
    .sort((left, right) => left.localeCompare(right))
    .map((source) => ({
      source,
      target: source === "package.json" ? source : `members/${snapshotDigest(source).slice(7)}`,
    }));
  yield* Effect.forEach(
    members,
    (member) =>
      Effect.andThen(
        writes.mkdir(dirname(join(temporary, member.target))),
        writes.copy(join(group.root, member.source), join(temporary, member.target)),
      ),
    { concurrency: 8, discard: true },
  );
  const prefix = portableRelative(capsuleRoot, temporary);
  if (prefix === undefined) return yield* ineligible("dependencies.stagePath");
  const captured = (yield* files.identities(
    capsuleRoot,
    members.map((member) => `${prefix}/${member.target}`),
    67_108_864,
  )).map((member) => ({ ...member, path: member.path.slice(prefix.length + 1) }));
  const content = snapshotDigest(
    canonicalJson({ name: group.name, version: group.version, members: captured }),
  ).slice(7);
  const root = `dependencies/${content}`;
  const target = join(capsuleRoot, root);
  if (yield* writes.exists(target)) {
    const existing = yield* files.identities(
      capsuleRoot,
      captured.map((member) => `${root}/${member.path}`),
      67_108_864,
    );
    const normalized = existing.map((member) => ({
      ...member,
      path: member.path.slice(root.length + 1),
    }));
    if (!sameSnapshotMembers(normalized, captured))
      return yield* ineligible("dependencies.contentCollision");
    yield* writes.remove(temporary);
  } else {
    yield* writes.mkdir(dirname(target));
    yield* writes.rename(temporary, target);
  }
  return {
    name: group.name,
    version: group.version,
    root,
    members: captured,
  } satisfies SnapshotDependency;
});

/** Finds the nearest installed or linked package root for one consumed input. */
const packageRootFor = Effect.fn("DevSnapshot.dependencyRoot")(function* (
  writes: FileSystemCapabilities,
  path: string,
  roots: Map<string, string>,
) {
  let current = dirname(path);
  const visited: string[] = [];
  for (let depth = 0; depth < 64; depth += 1) {
    const cached = roots.get(current);
    if (cached !== undefined) return cached;
    visited.push(current);
    if (yield* writes.exists(join(current, "package.json"))) {
      const identity = yield* optionalIdentity(writes, current);
      if (identity !== undefined) {
        for (const directory of visited) roots.set(directory, current);
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return yield* ineligible("dependencies.packageRoot");
});

/** Reads only the bounded package identity used by the portable receipt. */
const readIdentity = Effect.fn("DevSnapshot.dependencyIdentity")(function* (
  writes: FileSystemCapabilities,
  root: string,
) {
  const identity = yield* optionalIdentity(writes, root);
  return identity ?? (yield* ineligible("dependencies.packageIdentity"));
});

/** Treats export-subpath package files without identity as members of their parent package. */
const optionalIdentity = Effect.fn("DevSnapshot.optionalDependencyIdentity")(function* (
  writes: FileSystemCapabilities,
  root: string,
) {
  const source = yield* writes.readText(join(root, "package.json"));
  return yield* decodeSnapshotJson(SnapshotInstalledPackage, Buffer.from(source)).pipe(
    Effect.map((identity) => identity as { readonly name: string; readonly version: string }),
    Effect.catchTag("DevSnapshotRejected", () => Effect.succeed(undefined)),
  );
});

function portableRelative(root: string, path: string): string | undefined {
  const value = relative(root, path);
  if (value === "" || value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value))
    return undefined;
  return value.split(sep).join("/");
}

function isEnvironment(path: string): boolean {
  return path.split("/").some((segment) => segment === ".env" || segment.startsWith(".env."));
}

function ineligible(operation: string) {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}
