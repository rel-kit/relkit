/** Creates a grouped native auth/database acceptance project in a caller-owned directory. */
import { cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { generatedDatabaseSources } from "./generated-host-database.sources.js";
import { generatedRecordsSources } from "./generated-host-records.sources.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";

const tsconfigSchema = Schema.Struct({ files: Schema.Array(Schema.String) });

/**
 * Copies the maintained specialized example and writes native lifecycle probes.
 * @param root - Directory whose lifetime is owned by the calling acceptance test.
 * @param repository - Read-only contributor checkout.
 * @returns Completion after the original native descriptor fixture has been staged.
 */
export function writeGeneratedHostFixture(root: string, repository: string): Promise<void> {
  return Effect.runPromise(writeFixture(root, repository));
}

/**
 * Performs fixture-only writes without acquiring application clients.
 * @param root - Caller-owned destination.
 * @param repository - Maintained example/template source authority.
 * @returns Completion after all sources exist for native compiler acceptance.
 */
const writeFixture = Effect.fn("GeneratedHost.writeFixture")(function* (
  root: string,
  repository: string,
) {
  const example = join(repository, "examples/auth-drizzle");
  for (const path of ["src", "relkit.config.ts", "package.json"])
    yield* scaffoldNative("generated.fixture.copy", () =>
      cp(join(example, path), join(root, path), { recursive: true }),
    );
  const raw = yield* scaffoldNative("generated.fixture.config.read", () =>
    Bun.file(join(repository, "templates/default/v1/minimal/tsconfig.json")).text(),
  );
  const decoded = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(raw);
  const config = Schema.decodeUnknownSync(tsconfigSchema)(decoded);
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded))
    throw new TypeError("Fixture tsconfig must be an object");
  yield* scaffoldNative("generated.fixture.config.write", () =>
    writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({
        ...decoded,
        files: [...config.files, ".relkit/generated/context-registry.d.ts"],
      }),
    ),
  );
  yield* installedFixtureDependencies(root, example, repository);
  const schemaPath = join(root, "src/services/database/schema/index.ts");
  const schema = yield* scaffoldNative("generated.fixture.schema.read", () =>
    Bun.file(schemaPath).text(),
  );
  yield* scaffoldNative("generated.fixture.schema.write", () =>
    writeFile(schemaPath, schema + extraSchema),
  );
  for (const [path, source] of Object.entries({
    ...generatedDatabaseSources,
    ...generatedRecordsSources,
  })) {
    const target = join(root, path);
    yield* scaffoldNative("generated.fixture.source.directory", () =>
      mkdir(join(target, ".."), { recursive: true }),
    );
    yield* scaffoldNative("generated.fixture.source.write", () => writeFile(target, source));
  }
});

/**
 * Borrows installed SDK packages and Effect without mutating the maintained example.
 * @param root - Test-owned application destination.
 * @param example - Maintained example's installed dependency identity.
 * @param repository - Contributor-installed Effect identity for internal probes.
 * @returns Completion after every borrowed dependency has a local lexical entry.
 */
const installedFixtureDependencies = Effect.fn("GeneratedHost.dependencies")(function* (
  root: string,
  example: string,
  repository: string,
) {
  const modules = join(root, "node_modules");
  yield* scaffoldNative("generated.fixture.modules.directory", () => mkdir(modules));
  const entries = yield* scaffoldNative("generated.fixture.modules.list", () =>
    readdir(join(example, "node_modules")),
  );
  for (const entry of entries) {
    if (entry === "effect" || entry === "@relkit") continue;
    yield* scaffoldNative("generated.fixture.module.link", () =>
      symlink(join(example, "node_modules", entry), join(modules, entry)),
    );
  }
  yield* scaffoldNative("generated.fixture.sdk.directory", () => mkdir(join(modules, "@relkit")));
  const sdk = yield* scaffoldNative("generated.fixture.sdk.list", () =>
    readdir(join(example, "node_modules/@relkit")),
  );
  for (const name of sdk)
    yield* scaffoldNative("generated.fixture.sdk.link", () =>
      symlink(join(example, "node_modules/@relkit", name), join(modules, "@relkit", name)),
    );
  yield* scaffoldNative("generated.fixture.effect.link", () =>
    symlink(join(repository, "node_modules/effect"), join(modules, "effect")),
  );
});

/** Native Drizzle schema declarations remain plain TypeScript authoring APIs. */
const extraSchema = `
import { real } from "drizzle-orm/sqlite-core";
export const samples = sqliteTable("samples", {
  id: integer().primaryKey(), value: real().notNull(),
});
export const records = sqliteTable("records", {
  id: integer().primaryKey(), value: text().notNull(),
});
`;
