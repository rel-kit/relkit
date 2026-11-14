/** The interface and history worker need a real Node: Bun's `node` alias is skipped, old Node is refused. */
import { afterAll, beforeAll, expect, test } from "vitest";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import {
  findNodeExecutable,
  MINIMUM_NODE_VERSION,
  NodeExecutableError,
} from "../src/node-executable.js";

let root = "";
/** Directories holding one `node` each: a symlink to "Bun", a copied Bun, an old Node, a real Node. */
const dirs = { symlinkAlias: "", copiedAlias: "", oldNode: "", realNode: "" };
const fakeBun = () => join(root, "bun");
const probes = () => join(root, "probes.log");

/** A shell stand-in answers the probe the way the named runtime would. */
async function fakeNode(directory: string, versions: { bun: string | null; node: string }) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, "node");
  const answer = JSON.stringify(versions);
  await writeFile(file, `#!/bin/sh\necho probe >> "${probes()}"\necho '${answer}'\n`);
  await chmod(file, 0o755);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "relkit-node-executable-"));
  await writeFile(fakeBun(), "#!/bin/sh\nexit 1\n");
  await chmod(fakeBun(), 0o755);
  dirs.symlinkAlias = join(root, "bun-node-alias");
  await mkdir(dirs.symlinkAlias);
  await symlink(fakeBun(), join(dirs.symlinkAlias, "node"));
  dirs.copiedAlias = join(root, "copied-alias");
  await fakeNode(dirs.copiedAlias, { bun: "1.3.10", node: "24.3.0" });
  dirs.oldNode = join(root, "old-node");
  await fakeNode(dirs.oldNode, { bun: null, node: "18.20.0" });
  dirs.realNode = join(root, "real-node");
  await mkdir(dirs.realNode);
  await symlink(process.execPath, join(dirs.realNode, "node"));
});

afterAll(() => rm(root, { recursive: true, force: true }));

const onBun = (...path: string[]) => ({
  runtime: "bun" as const,
  execPath: fakeBun(),
  nodeVersion: "24.3.0",
  path: path.join(delimiter),
});

test("the declared Node engine and the launcher's minimum agree", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(manifest.engines.node).toBe(`>=${MINIMUM_NODE_VERSION}`);
});

test("on Node the running executable is used and PATH is kept", () => {
  const host = {
    runtime: "node" as const,
    execPath: "/opt/node",
    nodeVersion: "22.13.0",
    path: "/a",
  };
  expect(findNodeExecutable(host)).toEqual({
    executable: "/opt/node",
    version: "22.13.0",
    path: "/a",
  });
});

test("on Node an older release than the engine is refused with its version", () => {
  const host = { runtime: "node" as const, execPath: "/opt/node", nodeVersion: "18.1.0", path: "" };
  expect(() => findNodeExecutable(host)).toThrow(NodeExecutableError);
  expect(() => findNodeExecutable(host)).toThrow(/>=20\.9\.0; found \/opt\/node \(18\.1\.0\)/u);
});

test("on Bun the aliases before the first real Node are skipped and dropped from the child PATH", () => {
  const found = findNodeExecutable(onBun(dirs.symlinkAlias, dirs.copiedAlias, dirs.realNode));
  expect(found.executable).toBe(join(dirs.realNode, "node"));
  expect(found.version).toBe(process.versions.node);
  expect(found.path.split(delimiter)).toEqual([dirs.realNode]);
});

test("a Node older than the engine is passed over for a later one", () => {
  const found = findNodeExecutable(onBun(dirs.oldNode, dirs.realNode));
  expect(found.executable).toBe(join(dirs.realNode, "node"));
  expect(found.path.split(delimiter)).toEqual([dirs.oldNode, dirs.realNode]);
});

test("only Bun aliases on PATH fail as node-missing and name the `bun --bun` alias", () => {
  const error = captured(() => findNodeExecutable(onBun(dirs.symlinkAlias, dirs.copiedAlias)));
  expect(error.code).toBe("node-missing");
  expect(error.message).toContain("Node.js >=20.9.0");
  expect(error.message).toContain("bun --bun");
});

test("only an old Node on PATH fails as node-unsupported with the version found", () => {
  const error = captured(() => findNodeExecutable(onBun(dirs.oldNode)));
  expect(error.code).toBe("node-unsupported");
  expect(error.message).toContain("18.20.0");
});

test("a resolution is probed once per PATH and reused", async () => {
  await rm(probes(), { force: true });
  const host = onBun(join(root, "missing"), dirs.copiedAlias, dirs.realNode);
  const first = findNodeExecutable(host);
  expect(findNodeExecutable({ ...host })).toBe(first);
  expect((await readFile(probes(), "utf8")).trim().split("\n")).toEqual(["probe"]);
});

/** @param run - Call expected to throw the resolver's coded error. @returns The error. */
function captured(run: () => unknown): NodeExecutableError {
  try {
    run();
  } catch (error) {
    if (error instanceof NodeExecutableError) return error;
    throw error;
  }
  throw new Error("expected a NodeExecutableError");
}
