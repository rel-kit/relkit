/** Checks the existing packed Hono Bun leaf with its native SDK while preserving Node resolution and deep rejections. */
import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { packExportPackage, readExportManifest } from "../pack-export-native.js";
import { unpackTarball } from "../pack-and-smoke-integration-minimal.js";
import { runCommand } from "../pack-and-smoke-create-relkit-support.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "../scaffold-process.js";

test("resolves the packed Hono Bun leaf in Node and imports it only in Bun", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-native-bun-export-"));
  try {
    const fixture = await packedHonoLeaf(root);
    const output = await Effect.runPromise(
      Effect.flatMap(ScaffoldProcess, (process) =>
        process.run({ executable: "node", args: ["resolve.mjs"], cwd: fixture }),
      ).pipe(Effect.provide(scaffoldProcessLayer)),
    );
    expect(output).toContain("packed entries resolved; internal paths rejected");
    expect(await runCommand(["resolve.mjs", "--bun-only"], fixture)).toContain(
      "Bun-only public entries resolved",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

/** Uses the normal owner pack producer and only the real Hono dependency needed by its unchanged Bun leaf. */
async function packedHonoLeaf(root: string) {
  const owner = resolve(import.meta.dirname, "../../packages/runtime-hono");
  const fixture = join(root, "fixture");
  const packed = join(fixture, "node_modules/@relkit/runtime-hono");
  const archive = await Effect.runPromise(
    Effect.flatMap(ScaffoldProcess, (process) => packExportPackage(process.run, owner, root)).pipe(
      Effect.provide(scaffoldProcessLayer),
    ),
  );
  await unpackTarball(archive, packed);
  await cp(await realpath(join(owner, "node_modules/hono")), join(fixture, "node_modules/hono"), {
    recursive: true,
  });
  const manifest = await Effect.runPromise(readExportManifest(packed));
  const target = manifest.exports?.["./bun"];
  expect(target).toEqual({ types: "./dist/bun.d.ts", import: "./dist/bun.js" });
  await mkdir(fixture, { recursive: true });
  await writeFile(
    join(fixture, "expected-exports.json"),
    JSON.stringify({ "@relkit/runtime-hono": { "./bun": target } }),
  );
  await cp(
    resolve(import.meta.dirname, "../../tests/exports/fixture/resolve.mjs"),
    join(fixture, "resolve.mjs"),
  );
  return fixture;
}
