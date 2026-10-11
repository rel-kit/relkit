/**
 * Hashes one internal verification partition in an isolated Bun process. The
 * parent selects the root as this process's working directory and supplies
 * already-decoded relative paths; this boundary repeats lexical, root, parent,
 * descriptor and current-path checks before returning identities.
 */
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

interface Member {
  readonly path: string;
  readonly bytes: number;
  readonly hash: string;
}

type ExpectedMember = readonly [path: string, bytes: number, hash: string];

const PATH =
  /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_@+.,()=-]+(?:\/[A-Za-z0-9_@+.,()=-]+)*$/;

/** Executes the fixed stdin/stdout worker protocol without printing native details. */
function main(): void {
  try {
    const limit = Number(process.argv[2]);
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error();
    const input = JSON.parse(readFileSync(0, "utf8"));
    if (!Array.isArray(input) || input.length > 5_000) throw new Error();
    const root = realpathSync(".");
    const physical = root;
    const rootIdentity = statSync(root);
    if (process.argv[3] === "verify") {
      process.stdout.write(String(firstMismatch(root, physical, rootIdentity, input, limit)));
      return;
    }
    process.stdout.write(JSON.stringify(hashPaths(root, physical, rootIdentity, input, limit)));
  } catch {
    process.stderr.write("Snapshot verification failed.\n");
    process.exitCode = 1;
  }
}

/** Returns the first divergent expected member, or -1 after checking the full partition. */
function firstMismatch(
  root: string,
  physical: string,
  rootIdentity: Stats,
  values: readonly unknown[],
  limit: number,
): number {
  const expected = values.map(expectedMember);
  const paths = validatedPaths(
    root,
    expected.map((member) => member[0]),
  );
  const parents = uniqueParents(paths);
  assertContained(root, physical, rootIdentity, parents);
  for (const [index, { value, absolute }] of paths.entries()) {
    const actual = hashMember(value, absolute, limit);
    const member = expected[index];
    if (actual.bytes !== member?.[1] || actual.hash !== member[2]) return index;
  }
  assertContained(root, physical, rootIdentity, parents);
  return -1;
}

/** Decodes one compact parent-supplied member identity. */
function expectedMember(value: unknown): ExpectedMember {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    typeof value[0] !== "string" ||
    value[0].length > 1024 ||
    !PATH.test(value[0]) ||
    !Number.isSafeInteger(value[1]) ||
    Number(value[1]) < 0 ||
    typeof value[2] !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(value[2])
  )
    throw new Error();
  return value as unknown as ExpectedMember;
}

/** Hashes one finite group between complete unique-parent containment checks. */
function hashPaths(
  root: string,
  physical: string,
  rootIdentity: Stats,
  values: readonly unknown[],
  limit: number,
): readonly Member[] {
  const paths = validatedPaths(root, values);
  const parents = uniqueParents(paths);
  assertContained(root, physical, rootIdentity, parents);
  const members = paths.map(({ value, absolute }) => hashMember(value, absolute, limit));
  assertContained(root, physical, rootIdentity, parents);
  return members;
}

/** Decodes every path before native access so malformed work cannot partially execute. */
function validatedPaths(root: string, values: readonly unknown[]) {
  return values.map((value) => {
    if (typeof value !== "string" || value.length > 1024 || !PATH.test(value)) throw new Error();
    return { value, absolute: join(root, value) };
  });
}

/** Deduplicates containment checks across the complete worker partition. */
function uniqueParents(paths: readonly { readonly absolute: string }[]): readonly string[] {
  return [...new Set(paths.map(({ absolute }) => dirname(absolute)))];
}

/** Hashes complete bytes while retaining the no-follow descriptor until final checks. */
function hashMember(value: string, absolute: string, limit: number): Member {
  const descriptor = openSync(
    absolute,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > limit) throw new Error();
    const bytes = boundedBytes(descriptor, before.size);
    const current = statSync(absolute);
    if (!unchanged(before, current, bytes.length)) throw new Error();
    return {
      path: value,
      bytes: bytes.length,
      hash: `sha256:${Bun.SHA256.hash(bytes, "hex")}`,
    };
  } finally {
    closeSync(descriptor);
  }
}

/** Reads exactly the prechecked size and one growth-detection byte. */
function boundedBytes(descriptor: number, size: number): Uint8Array {
  const buffer = Buffer.allocUnsafe(size + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const count = readSync(descriptor, buffer, offset, buffer.length - offset, null);
    if (count === 0) return buffer.subarray(0, offset);
    offset += count;
  }
  throw new Error();
}

/** Confirms stable descriptor bytes and continued ownership of the current path. */
function unchanged(before: Stats, current: Stats, bytes: number): boolean {
  return (
    bytes === before.size &&
    current.size === before.size &&
    current.mtimeMs === before.mtimeMs &&
    current.ctimeMs === before.ctimeMs &&
    before.dev === current.dev &&
    before.ino === current.ino
  );
}

/** Rejects root replacement and physical parents outside the acquired root. */
function assertContained(
  root: string,
  physical: string,
  identity: Stats,
  parents: readonly string[],
): void {
  const current = statSync(root);
  if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino)
    throw new Error();
  for (const parent of parents) {
    const local = relative(physical, realpathSync(parent));
    if (local === ".." || local.startsWith("../") || isAbsolute(local)) throw new Error();
  }
}

main();
