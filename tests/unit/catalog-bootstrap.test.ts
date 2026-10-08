import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(import.meta.dir, "../..");
const assets = ["catalog-resolution.ts", "catalog-resolution.types.ts"];
const script = `import {resolveCatalogVersion} from "create-relkit/catalog-resolution";
const owner={catalog:{effect:"4.0.1"},catalogs:{peer:{react:"^19.0.0"}}};
if(resolveCatalogVersion(owner,"effect","catalog:")!=="4.0.1")throw new Error("Default propagation");
if(resolveCatalogVersion(owner,"react","catalog:peer")!=="^19.0.0")throw new Error("Peer propagation");
let missing=false;try{resolveCatalogVersion(owner,"absent","catalog:");}catch{missing=true;}
if(!missing)throw new Error("Missing entry silently accepted");
console.log("cold resolver passed");`;

/**
 * Runs an isolated native consumer with finite child ownership.
 * @param command - Literal executable vector.
 * @param cwd - Fixture or package directory.
 * @returns Captured stdout after successful native completion.
 */
async function run(command: readonly string[], cwd: string): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(30_000),
  });
  try {
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exit !== 0) throw new Error(`Native catalog probe failed (${exit}): ${stdout}${stderr}`);
    return stdout;
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited.catch(() => undefined);
  }
}

/**
 * Installs only the packed manifest and two pure source assets into a cold fixture.
 * @param source - Package directory supplying the manifest/source pair.
 * @param fixture - Owned consumer root with no workspace dist or dependencies.
 * @returns Completion after package-name resolution can reach the pure subpath.
 */
async function coldPackage(source: string, fixture: string): Promise<void> {
  const target = join(fixture, "node_modules/create-relkit");
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(join(fixture, "package.json"), '{"type":"module"}');
  await cp(join(source, "package.json"), join(target, "package.json"));
  for (const asset of assets) await cp(join(source, "src", asset), join(target, "src", asset));
}

test("pure catalog subpath boots before any generator or framework dist exists", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-catalog-cold-"));
  try {
    await coldPackage(join(repository, "packages/create-relkit"), fixture);
    expect(await Bun.file(join(fixture, "node_modules/create-relkit/dist/index.js")).exists()).toBe(
      false,
    );
    expect(await run([process.execPath, "-e", script], fixture)).toBe("cold resolver passed\n");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("actual generator tarball carries the same source resolver and works without dist", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-catalog-packed-"));
  try {
    const artifacts = join(fixture, "artifacts");
    await mkdir(artifacts);
    const packed = (
      await run(
        [process.execPath, "pm", "pack", "--ignore-scripts", "--destination", artifacts, "--quiet"],
        join(repository, "packages/create-relkit"),
      )
    ).trim();
    const tarball = join(artifacts, packed.split("/").at(-1)!);
    await run(["tar", "-xzf", tarball, "-C", artifacts], fixture);
    for (const asset of assets)
      expect(await readFile(join(artifacts, "package/src", asset), "utf8")).toBe(
        await readFile(join(repository, "packages/create-relkit/src", asset), "utf8"),
      );
    const consumer = join(fixture, "consumer");
    await coldPackage(join(artifacts, "package"), consumer);
    expect(await run([process.execPath, "-e", script], consumer)).toBe("cold resolver passed\n");
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 60_000);
