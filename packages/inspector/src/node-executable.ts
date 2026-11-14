/**
 * Finds the real Node executable the interface (a Next.js standalone server) and the DuckDB
 * history worker need. On Node that is the running executable. On Bun it is the first `node` on
 * `PATH` that is not Bun itself: `bun --bun` puts a directory whose `node` is Bun first on `PATH`,
 * as a symlink on macOS and possibly a copy or hard link elsewhere, so a candidate that does not
 * resolve to Bun's own file is asked for `process.versions.bun`.
 */
import { execFileSync } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { Data, Effect } from "effect";
import { InspectionConnectionError } from "relkit/inspector-api/connection";

/** Lowest Node release the package declares in its engines. */
export const MINIMUM_NODE_VERSION = "20.9.0";

/** Node executable for the Inspector's children. */
export interface NodeExecutable {
  /** Absolute path of the executable. */
  readonly executable: string;
  /** Its `process.versions.node`. */
  readonly version: string;
  /** `PATH` for the children, without the directories whose `node` is Bun. */
  readonly path: string;
}

/** The process the resolution runs in. */
export interface NodeExecutableHost {
  readonly runtime: "bun" | "node";
  /** The running runtime's executable. */
  readonly execPath: string;
  /** The running runtime's `process.versions.node`. */
  readonly nodeVersion: string;
  /** Search path. */
  readonly path: string;
}

/** No usable Node was found; the message names Node, the version needed and the Bun alias. */
export class NodeExecutableError extends Data.TaggedError("NodeExecutableError")<{
  readonly code: "node-missing" | "node-unsupported";
  readonly message: string;
}> {}

const resolved = new Map<string, NodeExecutable>();
const probeScript = "JSON.stringify({bun:process.versions.bun??null,node:process.versions.node})";

/**
 * Resolves Node for this process, once per runtime and search path.
 * @param host - Process facts; defaults to the running process.
 * @returns The executable, its version and the children's `PATH`.
 * @throws {NodeExecutableError} When no Node of a supported release is found.
 */
export function findNodeExecutable(host: NodeExecutableHost = currentHost()): NodeExecutable {
  const key = `${host.runtime}\0${host.execPath}\0${host.path}`;
  const cached = resolved.get(key);
  if (cached) return cached;
  const found = host.runtime === "node" ? runningNode(host) : nodeOnPath(host);
  resolved.set(key, found);
  return found;
}

/**
 * Resolves Node for the interface child.
 * @returns The executable, or `ui.node-missing` / `ui.node-unsupported` naming what is needed.
 */
export const resolveNodeExecutable = Effect.fn("Inspector.resolveNode")(function* () {
  return yield* Effect.try({
    try: () => findNodeExecutable(),
    catch: (cause) =>
      cause instanceof NodeExecutableError
        ? new InspectionConnectionError({ operation: `ui.${cause.code}`, cause })
        : new InspectionConnectionError({
            operation: "ui.node-missing",
            cause: cause instanceof Error ? cause : new Error("Node lookup failed", { cause }),
          }),
  });
});

/** @returns Facts about the running process. */
function currentHost(): NodeExecutableHost {
  return {
    runtime: typeof process.versions.bun === "string" ? "bun" : "node",
    execPath: process.execPath,
    nodeVersion: process.versions.node,
    path: process.env.PATH ?? "",
  };
}

/** @param host - A Node process. @returns The running executable, when its release is supported. */
function runningNode(host: NodeExecutableHost): NodeExecutable {
  if (!supported(host.nodeVersion)) throw unsupported([`${host.execPath} (${host.nodeVersion})`]);
  return { executable: host.execPath, version: host.nodeVersion, path: host.path };
}

/** @param host - A Bun process. @returns The first supported real Node on its `PATH`. */
function nodeOnPath(host: NodeExecutableHost): NodeExecutable {
  const name = process.platform === "win32" ? "node.exe" : "node";
  const bun = realPath(host.execPath);
  const aliases = new Set<string>();
  const tooOld: string[] = [];
  for (const directory of host.path.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, name);
    if (!executable(candidate)) continue;
    const versions = realPath(candidate) === bun ? { bun: "self", node: "" } : probe(candidate);
    if (versions === undefined) continue;
    if (versions.bun !== null) {
      aliases.add(directory);
      continue;
    }
    if (!supported(versions.node)) {
      tooOld.push(`${candidate} (${versions.node})`);
      continue;
    }
    const path = host.path
      .split(delimiter)
      .filter((entry) => !aliases.has(entry))
      .join(delimiter);
    return { executable: candidate, version: versions.node, path };
  }
  if (tooOld.length > 0) throw unsupported(tooOld);
  return missing();
}

/** @returns The error for a `PATH` without Node. */
function missing(): never {
  throw new NodeExecutableError({
    code: "node-missing",
    message:
      `The Inspector interface needs Node.js >=${MINIMUM_NODE_VERSION} and no \`node\` on PATH is Node ` +
      "(`bun --bun` makes `node` an alias of Bun). Install Node.js, or run the Inspector without `--bun`.",
  });
}

/** @param found - Executables with their versions. @returns The error naming them. */
function unsupported(found: readonly string[]): NodeExecutableError {
  return new NodeExecutableError({
    code: "node-unsupported",
    message: `The Inspector interface needs Node.js >=${MINIMUM_NODE_VERSION}; found ${found.join(", ")}.`,
  });
}

/** @param candidate - Executable to ask. @returns Its runtime versions, or undefined when it does not answer. */
function probe(candidate: string): { bun: string | null; node: string } | undefined {
  try {
    const output = execFileSync(candidate, ["-p", probeScript], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(output.trim()) as { bun?: unknown; node?: unknown };
    if (typeof parsed.node !== "string") return undefined;
    return { bun: typeof parsed.bun === "string" ? parsed.bun : null, node: parsed.node };
  } catch {
    return undefined;
  }
}

/** @param version - `major.minor.patch`. @returns Whether it meets {@link MINIMUM_NODE_VERSION}. */
function supported(version: string): boolean {
  const have = version.split(".").map(Number);
  const need = MINIMUM_NODE_VERSION.split(".").map(Number);
  for (let index = 0; index < need.length; index++) {
    const difference = (have[index] ?? 0) - need[index]!;
    if (Number.isNaN(difference)) return false;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/** @param file - Candidate path. @returns Whether it is an executable regular file. */
function executable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** @param file - Existing path. @returns Its canonical path, or itself when that fails. */
function realPath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}
