import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, parse, relative, resolve } from "node:path";
import { createLocalProjectIdentity, type LocalProjectIdentity } from "./identity.js";

const MAX_STATE_BYTES = 1024 * 1024;
export type LocalStateFileName =
  "lease.json" | "local-services.state.json" | "provider-overrides.json";

export class LocalStateError extends Error {
  readonly code = "RELKIT_LOCAL_STATE_INVALID" as const;

  constructor() {
    super("Local state path or data is invalid.");
    this.name = "LocalStateError";
  }
}

export function localStateDirectory(identity: LocalProjectIdentity): string {
  assertIdentity(identity);
  const directory = join(
    identity.projectRoot,
    ".relkit",
    "state",
    "local",
    identity.localProjectId.slice("sha256:".length),
  );
  assertContained(identity.projectRoot, directory);
  return directory;
}

export function ensureLocalStateDirectory(identity: LocalProjectIdentity): string {
  const directory = localStateDirectory(identity);
  const relkit = join(identity.projectRoot, ".relkit");
  ensureDirectory(relkit, false);
  ensureDirectory(join(relkit, "state"), true);
  ensureDirectory(join(relkit, "state", "local"), true);
  ensureDirectory(directory, true);
  return directory;
}

export function readLocalStateText(
  identity: LocalProjectIdentity,
  name: LocalStateFileName,
): string | undefined {
  const directory = localStateDirectory(identity);
  if (!assertExistingStateDirectories(identity, directory)) return undefined;
  const path = stateFile(directory, name);
  if (!existsSync(path)) return undefined;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES) invalid();
  chmodSync(path, 0o600);
  return readFileSync(path, "utf8");
}

export function writeLocalStateText(
  identity: LocalProjectIdentity,
  name: LocalStateFileName,
  value: string,
): void {
  if (Buffer.byteLength(value) > MAX_STATE_BYTES) invalid();
  const directory = ensureLocalStateDirectory(identity);
  const target = stateFile(directory, name);
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink()) invalid();
  }
  const temporary = join(directory, `.state-${randomUUID()}.tmp`);
  let file: number | undefined;
  try {
    file = openSync(temporary, "wx", 0o600);
    writeFileSync(file, value, "utf8");
    fsyncSync(file);
    closeSync(file);
    file = undefined;
    renameSync(temporary, target);
    chmodSync(target, 0o600);
  } finally {
    if (file !== undefined) closeSync(file);
    rmSync(temporary, { force: true });
  }
}

export function removeLocalStateFile(
  identity: LocalProjectIdentity,
  name: LocalStateFileName,
): void {
  const directory = localStateDirectory(identity);
  if (!assertExistingStateDirectories(identity, directory)) return;
  const path = stateFile(directory, name);
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) invalid();
  rmSync(path, { force: true });
}

export async function withLocalStateTemporaryFile<Value>(
  identity: LocalProjectIdentity,
  value: string,
  operation: (path: string) => Promise<Value>,
): Promise<Value> {
  if (Buffer.byteLength(value) > MAX_STATE_BYTES) invalid();
  const directory = ensureLocalStateDirectory(identity);
  const path = join(directory, `.secret-${randomUUID()}.env`);
  let file: number | undefined;
  try {
    file = openSync(path, "wx", 0o600);
    writeFileSync(file, value, "utf8");
    fsyncSync(file);
    closeSync(file);
    file = undefined;
    return await operation(path);
  } finally {
    if (file !== undefined) closeSync(file);
    rmSync(path, { force: true });
  }
}

function assertIdentity(identity: LocalProjectIdentity): void {
  if (identity.projectRoot === parse(identity.projectRoot).root) invalid();
  const expected = createLocalProjectIdentity(identity.projectRoot, identity.applicationId);
  if (
    expected.projectRoot !== identity.projectRoot ||
    expected.localProjectId !== identity.localProjectId
  ) {
    invalid();
  }
}

function assertExistingStateDirectories(
  identity: LocalProjectIdentity,
  directory: string,
): boolean {
  for (const path of [
    join(identity.projectRoot, ".relkit"),
    join(identity.projectRoot, ".relkit", "state"),
    join(identity.projectRoot, ".relkit", "state", "local"),
    directory,
  ]) {
    if (!existsSync(path)) return false;
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) invalid();
  }
  return true;
}

function ensureDirectory(path: string, restrict: boolean): void {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink()) invalid();
  if (restrict) chmodSync(path, 0o700);
}

function stateFile(directory: string, name: LocalStateFileName): string {
  const path = resolve(directory, name);
  assertContained(directory, path);
  return path;
}

function assertContained(root: string, candidate: string): void {
  const path = relative(resolve(root), resolve(candidate));
  if (path === "" || path.startsWith("..") || isAbsolute(path)) invalid();
}

function invalid(): never {
  throw new LocalStateError();
}
