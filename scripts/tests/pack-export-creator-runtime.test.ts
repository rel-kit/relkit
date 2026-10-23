/** Verifies every actual packed Bun creator entry without inventing a Node execution contract. */
import { expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import {
  assertExportManifest,
  packExportPackage,
  readExportManifest,
} from "../pack-export-native.js";
import { copyExternalDependencies, unpackTarball } from "../pack-and-smoke-integration-minimal.js";
import { runCommand } from "../pack-and-smoke-create-relkit-support.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "../scaffold-process.js";

test("resolves every packed creator entry in Node and imports every entry in Bun", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-creator-bun-export-"));
  try {
    const fixture = await packedCreatorEntries(root);
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

/** Packs both first-party owners and reuses the generic SDK-free copier only for creator's normal external framework dependencies. */
async function packedCreatorEntries(root: string) {
  const repository = resolve(import.meta.dirname, "../..");
  const owner = join(repository, "packages/create-relkit");
  const fixture = join(root, "fixture");
  for (const name of ["contracts", "create-relkit"]) {
    const archive = await Effect.runPromise(
      Effect.flatMap(ScaffoldProcess, (process) =>
        packExportPackage(process.run, join(repository, "packages", name), root),
      ).pipe(Effect.provide(scaffoldProcessLayer)),
    );
    await unpackTarball(
      archive,
      join(fixture, "node_modules", name === "contracts" ? "@relkit/contracts" : name),
    );
  }
  const manifest = await Effect.runPromise(
    readExportManifest(join(fixture, "node_modules/create-relkit")),
  );
  assertExportManifest(repository, owner, manifest);
  const external = Object.keys(manifest.dependencies ?? {}).filter(
    (name) => name !== "@relkit/contracts",
  );
  await copyExternalDependencies(fixture, new Set(external), repository, [owner]);
  await writeFile(
    join(fixture, "expected-exports.json"),
    JSON.stringify({ "create-relkit": manifest.exports }),
  );
  await cp(join(repository, "tests/exports/fixture/resolve.mjs"), join(fixture, "resolve.mjs"));
  return fixture;
}
