/** Prepares real SQLite/auth through candidate-only metadata, repairs and runtime installs. */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { readManifests, readPackedManifest } from "../../pack-and-smoke-create-relkit-pack.js";
import { buildAndInstall, install } from "./production-packed-project.js";
import { prepareAuthJobs } from "./production-auth-jobs.js";

const Catalog = Schema.Struct({
  relkit: Schema.Struct({
    buildCatalog: Schema.Struct({
      dependencies: Schema.Record(Schema.String, Schema.String),
      patches: Schema.Record(
        Schema.String,
        Schema.Struct({
          version: Schema.String,
          key: Schema.String,
          asset: Schema.String,
          hash: Schema.String,
        }),
      ),
    }),
  }),
});

const TypeScriptConfig = Schema.Struct({
  compilerOptions: Schema.Record(Schema.String, Schema.Json),
  files: Schema.Array(Schema.String),
  include: Schema.Array(Schema.String),
  exclude: Schema.optionalKey(Schema.Array(Schema.String)),
});

/**
 * Preserves the sample's effective options and aliases without its workspace-only extends.
 * @param root - Owned external auth developer fixture, before its first build.
 * @param example - Maintained auth sample inheriting the adjacent commerce configuration.
 * @returns After publishing the same effective settings in a self-contained configuration.
 */
export async function writeAuthTypeScriptConfig(root: string, example: string): Promise<void> {
  const decode = Schema.decodeUnknownSync(Schema.fromJsonString(TypeScriptConfig));
  const inherited = decode(await readFile(resolve(example, "../commerce/tsconfig.json"), "utf8"));
  const own = decode(await readFile(join(example, "tsconfig.json"), "utf8"));
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify(
      {
        ...inherited,
        ...own,
        compilerOptions: { ...inherited.compilerOptions, ...own.compilerOptions },
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
}

/**
 * Extracts the canonical repair from the actual packed generator rather than source bytes.
 * @param tarballs - Candidate archive paths indexed by their first-party package name.
 * @returns Verified generator catalog metadata, patch descriptor and exact canonical patch bytes.
 */
async function packedRepair(tarballs: ReadonlyMap<string, string>) {
  const path = tarballs.get("create-relkit");
  assert.ok(path, "Candidate generator tarball is absent");
  const catalog = Schema.decodeUnknownSync(Catalog)(await readPackedManifest(path)).relkit
    .buildCatalog;
  const descriptor = catalog.patches["drizzle-orm"];
  assert.ok(descriptor);
  const files = await new Bun.Archive(await Bun.file(path).bytes()).files(
    `package/dist/${descriptor.asset}`,
  );
  const content = await files.get(`package/dist/${descriptor.asset}`)?.text();
  assert.ok(content);
  assert.equal(createHash("sha256").update(content).digest("hex"), descriptor.hash);
  return { catalog, descriptor, content };
}

/**
 * Builds and reinstalls the maintained sample with its real native repair requirements.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param registry - Candidate registry origin serving only verified first-party tarballs.
 * @param manifests - Current workspace release package identities and source locations.
 * @param tarballs - Candidate archive paths indexed by their first-party package name.
 * @returns The relocated production SQLite/auth installation after deleting its developer fixture.
 */
export async function preparePackedAuth(
  root: string,
  registry: string,
  manifests: Awaited<ReturnType<typeof readManifests>>,
  tarballs: ReadonlyMap<string, string>,
) {
  const developer = join(root, "auth-developer");
  const example = resolve(import.meta.dirname, "../../../examples/auth-drizzle");
  await cp(join(example, "src"), join(developer, "src"), { recursive: true });
  await cp(join(example, "relkit.config.ts"), join(developer, "relkit.config.ts"));
  await writeAuthTypeScriptConfig(developer, example);
  await prepareAuthJobs(developer);
  const repair = await packedRepair(tarballs);
  const dependencies = Object.fromEntries(
    [
      "@relkit/app",
      "@relkit/better-auth",
      "@relkit/drizzle",
      "@relkit/client",
      "@relkit/local",
    ].map((name) => [name, manifests.get(name)!.manifest.version]),
  );
  Object.assign(dependencies, {
    "better-auth": repair.catalog.dependencies["better-auth"],
    "drizzle-orm": repair.descriptor.version,
  });
  await mkdir(join(developer, "patches"));
  await writeFile(join(developer, repair.descriptor.asset), repair.content);
  await writeFile(
    join(developer, "package.json"),
    JSON.stringify({
      name: "production-auth-proof",
      private: true,
      type: "module",
      dependencies,
      devDependencies: {
        "@relkit/cli": manifests.get("@relkit/cli")!.manifest.version,
        typescript: repair.catalog.dependencies.typescript,
        "@types/bun": repair.catalog.dependencies["@types/bun"],
        "@cloudflare/workers-types": repair.catalog.dependencies["@cloudflare/workers-types"],
      },
      patchedDependencies: { [repair.descriptor.key]: repair.descriptor.asset },
      overrides: { "@better-fetch/fetch": repair.catalog.dependencies["@better-fetch/fetch"] },
    }),
  );
  await install(developer, registry, join(root, "auth-developer-cache"), false);
  const production = await buildAndInstall(root, developer, registry, "auth");
  await cp(
    join(developer, "src/services/database/migrations"),
    join(production.root, "migrations"),
    { recursive: true },
  );
  await verifyCopiedRepair(production.root, repair.descriptor.hash);
  await rm(developer, { recursive: true, force: true });
  return production;
}

/**
 * The emitted normal installation must preserve the exact candidate repair asset.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param hash - Canonical candidate patch SHA-256 expected for the emitted asset.
 * @returns After the selected patch registration and emitted asset hash match the candidate authority.
 */
async function verifyCopiedRepair(root: string, hash: string) {
  const build = join(root, ".relkit/build");
  const manifest = Schema.decodeUnknownSync(
    Schema.Struct({
      patchedDependencies: Schema.Record(Schema.String, Schema.String),
    }),
  )(JSON.parse(await readFile(join(build, "package.json"), "utf8")));
  assert.equal(Object.values(manifest.patchedDependencies).length, 1);
  const path = Object.values(manifest.patchedDependencies)[0]!;
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(build, path)))
      .digest("hex"),
    hash,
  );
}
