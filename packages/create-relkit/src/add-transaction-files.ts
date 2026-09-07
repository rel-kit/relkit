import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, rmdir, writeFile, chmod } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { ADD_FAILURE_CODES, AddScaffoldError, type ScaffoldFileOperation } from "./add-types.js";

export interface FileSnapshot {
  readonly path: string;
  readonly content?: Uint8Array;
  readonly mode?: number;
}

export function operationPath(root: string, path: string): string {
  const absolute = resolve(root, path);
  const local = relative(root, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.collision,
      `Scaffold path escapes the project: ${path}`,
    );
  }
  return absolute;
}

export async function snapshotFiles(
  root: string,
  operations: readonly ScaffoldFileOperation[],
  includeLock: boolean,
): Promise<readonly FileSnapshot[]> {
  const paths = new Set(operations.map((operation) => operationPath(root, operation.path)));
  if (includeLock) paths.add(resolve(root, "bun.lock"));
  const snapshots: FileSnapshot[] = [];
  for (const path of paths) {
    const metadata = await metadataFor(path);
    if (metadata === undefined) snapshots.push({ path });
    else {
      if (!metadata.isFile()) collision(`${path} is not a regular file.`);
      snapshots.push({ path, content: await readFile(path), mode: metadata.mode & 0o777 });
    }
  }
  return snapshots;
}

export async function validateOperationActions(
  root: string,
  operations: readonly ScaffoldFileOperation[],
): Promise<void> {
  const seen = new Set<string>();
  for (const operation of operations) {
    const path = operationPath(root, operation.path);
    if (seen.has(path)) collision(`Scaffold plan contains duplicate path ${operation.path}.`);
    seen.add(path);
    const exists = (await metadataFor(path)) !== undefined;
    if (operation.action === "create" && exists) collision(`${operation.path} already exists.`);
    if (operation.action === "update" && !exists) collision(`${operation.path} does not exist.`);
  }
}

export async function applyFileOperations(
  root: string,
  operations: readonly ScaffoldFileOperation[],
  createdDirectories: Set<string>,
): Promise<void> {
  for (const operation of operations) {
    const path = operationPath(root, operation.path);
    await ensureParent(root, dirname(path), createdDirectories);
    await atomicWrite(path, operation.content, operation.mode);
  }
}

export async function restoreFiles(
  snapshots: readonly FileSnapshot[],
  createdDirectories: ReadonlySet<string>,
): Promise<void> {
  for (const snapshot of [...snapshots].reverse()) {
    if (snapshot.content === undefined) await rm(snapshot.path, { force: true });
    else await atomicWrite(snapshot.path, snapshot.content, snapshot.mode);
  }
  for (const path of [...createdDirectories].sort((left, right) => right.length - left.length)) {
    await rmdir(path).catch(() => undefined);
  }
}

async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  mode?: number,
): Promise<void> {
  const temporary = `${path}.relkit-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, mode === undefined ? {} : { mode });
    if (mode !== undefined) await chmod(temporary, mode);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function ensureParent(root: string, path: string, created: Set<string>): Promise<void> {
  const missing: string[] = [];
  for (let current = path; current !== root; current = dirname(current)) {
    const metadata = await metadataFor(current);
    if (metadata) {
      if (!metadata.isDirectory()) {
        collision(`${relative(root, current)} is not a project directory.`);
      }
      break;
    }
    missing.push(current);
  }
  await mkdir(path, { recursive: true });
  for (const directory of missing) created.add(directory);
}

async function metadataFor(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}
