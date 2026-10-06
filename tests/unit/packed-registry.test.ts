import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startRegistry } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";

test("smoke registry serves verified tarball metadata instead of workspace metadata", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-packed-registry-"));
  let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
  try {
    const root = JSON.parse(await readFile(resolve(import.meta.dir, "../../package.json"), "utf8"));
    const source = {
      name: "fixture-package",
      version: "1.0.0",
      description: "workspace description",
      dependencies: { effect: "catalog:" },
      peerDependencies: { react: "catalog:peer" },
    };
    const packed = {
      ...source,
      description: "packed description",
      dependencies: { effect: root.catalog.effect },
      peerDependencies: { react: root.catalogs.peer.react },
    };
    await mkdir(join(fixture, "package"));
    await writeFile(join(fixture, "package/package.json"), JSON.stringify(packed));
    const artifact = join(fixture, "package.tgz");
    const child = Bun.spawn(["tar", "-czf", artifact, "-C", fixture, "package"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await new Response(child.stderr).text()).toBe("");
    expect(await child.exited).toBe(0);
    server = await startRegistry(
      fixture,
      new Map([[source.name, artifact]]),
      new Map([[source.name, { directory: fixture, manifest: source }]]),
    );
    const response = await fetch(`http://127.0.0.1:${server.port}/${source.name}`);
    const metadata = (await response.json()) as {
      versions: Record<string, typeof packed>;
    };
    expect(metadata.versions["1.0.0"]?.description).toBe("packed description");
    expect(metadata.versions["1.0.0"]?.dependencies).toEqual(packed.dependencies);
    expect(metadata.versions["1.0.0"]?.peerDependencies).toEqual(packed.peerDependencies);
    expect(
      await fetch(`http://127.0.0.1:${server.port}/_tar/${source.name}`).then((result) =>
        result.arrayBuffer(),
      ),
    ).toEqual(
      await readFile(artifact).then((bytes) =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ),
    );
  } finally {
    await server?.stop(true);
    await rm(fixture, { recursive: true, force: true });
  }
});
