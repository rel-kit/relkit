import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildCatalog } from "./build-catalog.types.js";
import { readPackedManifest, startRegistry } from "./pack-and-smoke-create-relkit-pack.js";
import { runCommand, type Manifest } from "./pack-and-smoke-create-relkit-support.js";

/**
 * Verifies a standalone PostgreSQL consumer using only actual registry tarballs.
 * @param tarballs - Packed RELKIT artifacts, including the generator and native integration.
 * @param manifests - Source identities used to validate registry artifact metadata.
 * @returns When installation and strict dependency declaration compilation pass.
 * @remarks Uses an isolated install cache and a patch extracted from the generator
 * archive; no workspace dependency or patch files are copied into the consumer.
 */
export async function verifyPackedPostgresConsumer(
  tarballs: Map<string, string>,
  manifests: Map<string, { directory: string; manifest: Manifest }>,
): Promise<void> {
  const generatorPath = requiredTarball(tarballs, "create-relkit");
  const generator = await readPackedManifest(generatorPath);
  const native = await readPackedManifest(requiredTarball(tarballs, "@relkit/effect-mq"));
  const catalog = (generator.relkit as { buildCatalog?: BuildCatalog } | undefined)?.buildCatalog;
  const patch = catalog?.patches["drizzle-orm"];
  if (catalog === undefined || patch === undefined || patch.asset !== "patches/drizzle-orm.patch")
    throw new Error("Packed generator does not describe its portable Drizzle patch.");
  const asset = await readPackedPatch(generatorPath, patch.asset);
  if (createHash("sha256").update(asset).digest("hex") !== patch.hash)
    throw new Error("Packed generator patch hash does not match its manifest.");
  const fixture = await mkdtemp(join(tmpdir(), "relkit-packed-postgres-"));
  let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
  try {
    const patchPath = `patches/${patch.key}.patch`;
    await mkdir(join(fixture, "patches"));
    await writeFile(join(fixture, patchPath), asset);
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify(
        {
          name: "relkit-packed-postgres-consumer",
          private: true,
          type: "module",
          dependencies: {
            "@relkit/effect-mq": native.version,
            effect: native.dependencies?.effect,
            "@effect/sql-pg": native.dependencies?.["@effect/sql-pg"],
            "drizzle-orm": native.dependencies?.["drizzle-orm"],
          },
          devDependencies: {
            typescript: catalog.dependencies.typescript,
            "@types/bun": catalog.dependencies["@types/bun"],
          },
          patchedDependencies: { [patch.key]: patchPath },
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      join(fixture, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            types: ["bun"],
          },
          files: ["postgres.ts"],
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(join(fixture, "postgres.ts"), postgresProbe(catalog.effectVersion));
    server = await startRegistry(fixture, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port}`;
    await runCommand(
      ["install", "--force", "--no-cache", "--registry", registry],
      fixture,
      registry,
      join(fixture, "install-cache"),
    );
    await runCommand(
      ["node_modules/typescript/bin/tsc", "--project", "tsconfig.json", "--pretty", "false"],
      fixture,
    );
    console.log(
      `Packed PostgreSQL consumer passed (Effect ${catalog.effectVersion}, strict dependency declarations).`,
    );
  } finally {
    await server?.stop(true);
    await rm(fixture, { recursive: true, force: true });
  }
}

/**
 * Requires an artifact before creating a consumer fixture.
 * @param tarballs - Available packed artifacts.
 * @param name - Package whose archive is required.
 * @returns Its archive path.
 */
function requiredTarball(tarballs: ReadonlyMap<string, string>, name: string): string {
  const artifact = tarballs.get(name);
  if (artifact === undefined) throw new Error(`Missing packed consumer dependency: ${name}`);
  return artifact;
}

/**
 * Extracts the exact portable patch bytes from the generator archive.
 * @param path - Generator tarball path.
 * @param asset - Validated dist-relative patch path.
 * @returns The archived bytes.
 */
async function readPackedPatch(path: string, asset: string): Promise<Uint8Array> {
  const child = Bun.spawn(["tar", "-xOf", path, `package/dist/${asset}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [bytes, stderr, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Cannot read portable packed patch: ${asset}\n${stderr}`);
  return new Uint8Array(bytes);
}

/**
 * Builds positive and negative SQL, scope, and native identity type probes.
 * @param effectVersion - Exact stable Effect pin read from the packed generator.
 * @returns Standalone consumer source for strict dependency compilation.
 */
function postgresProbe(effectVersion: string): string {
  return `import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import type { SqlError } from "effect/sql/SqlError";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { sql } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { deploymentProfile } from "@relkit/effect-mq/deployment";

declare const db: PgDrizzle.EffectPgDatabase;
declare const client: PgClient.PgClient;
const transaction = db.transaction(() => Effect.succeed(1));
const query = db.execute(sql\`select 1\`);
const listen = client.listen("effect_mq_packed_compile_probe");
type IsAny<T> = 0 extends (1 & T) ? true : false;
const transactionIsAny: IsAny<Effect.Error<typeof transaction>> = false;
const transactionHasSqlError: [SqlError] extends [Effect.Error<typeof transaction>] ? true : false = true;
const transactionErrors: Effect.Effect<number, SqlError> = transaction;
const queryIsAny: IsAny<Effect.Error<typeof query>> = false;
const queryHasDrizzleError: [EffectDrizzleQueryError] extends [Effect.Error<typeof query>] ? true : false = true;
const listenIsAny: IsAny<Effect.Error<typeof listen>> = false;
const listenHasSqlError: [SqlError] extends [Effect.Error<typeof listen>] ? true : false = true;
const nativeEffect: typeof deploymentProfile.effect = ${JSON.stringify(effectVersion)};
// @ts-expect-error The published native identity must retain its exact Effect literal.
const wrongNativeEffect: typeof deploymentProfile.effect = "0.0.0";
// @ts-expect-error Transactions retain their SQL error channel.
const infallible: Effect.Effect<number> = transaction;
// @ts-expect-error Database acquisition requires PgClient authority.
Effect.runPromise(PgDrizzle.makeWithDefaults());
// @ts-expect-error LISTEN requires a scope owner.
Effect.runPromise(listen);
`;
}
