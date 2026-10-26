/** Verifies candidate registry metadata, archive integrity and host-origin restrictions. */
import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startRegistry } from "../../scripts/pack-and-smoke-create-relkit-pack.ts";

test("smoke registry serves verified tarball metadata instead of workspace metadata", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-packed-registry-"));
  let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
  try {
    const { source, packed, artifact } = await packedFixture(fixture);
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
    const docker = await fetch(`http://127.0.0.1:${server.port}/${source.name}`, {
      headers: { host: `host.docker.internal:${server.port}` },
    });
    expect(await docker.json()).toMatchObject({
      versions: {
        "1.0.0": {
          dist: { tarball: `http://host.docker.internal:${server.port}/_tar/${source.name}` },
        },
      },
    });
    for (const host of [`untrusted.invalid:${server.port}`, "host.docker.internal:1"]) {
      const rejected = await fetch(`http://127.0.0.1:${server.port}/${source.name}`, {
        headers: { host },
      });
      expect(rejected.status).toBe(400);
      await rejected.text();
    }
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

test("upstream proxy requests compact metadata and releases completed response bodies", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-packed-registry-memory-"));
  const original = globalThis.fetch;
  const accepts: Array<string | null> = [];
  const proxy = spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).startsWith("https://registry.npmjs.org/")) {
      accepts.push(new Headers(init?.headers).get("accept"));
      return Promise.resolve(Response.json({ name: "external", request: accepts.length }));
    }
    return original(input, init);
  });
  let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
  try {
    server = await startRegistry(
      fixture,
      new Map(),
      new Map([
        [
          "unpacked-candidate",
          { directory: fixture, manifest: { name: "unpacked-candidate", version: "1.0.0" } },
        ],
      ]),
    );
    const url = `http://127.0.0.1:${server.port}/external`;
    expect(await (await original(url)).json()).toMatchObject({ request: 1 });
    expect(await (await original(url)).json()).toMatchObject({ request: 2 });
    expect(accepts).toEqual([
      "application/vnd.npm.install-v1+json",
      "application/vnd.npm.install-v1+json",
    ]);
    const missing = await original(`http://127.0.0.1:${server.port}/unpacked-candidate`);
    expect(missing.status).toBe(404);
    await missing.arrayBuffer();
    expect(accepts).toHaveLength(2);
  } finally {
    proxy.mockRestore();
    await server?.stop(true);
    await rm(fixture, { recursive: true, force: true });
  }
});

/**
 * Constructs real candidate bytes without borrowing workspace metadata.
 * @param fixture - Owned registry fixture root receiving the generated candidate archive.
 * @returns The generated tarball map and matching fixture package metadata.
 */
async function packedFixture(fixture: string) {
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
  return { source, packed, artifact };
}
