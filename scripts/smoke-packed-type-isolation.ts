/**
 * Certifies selected auth, database, testing and client contracts in real packed installs.
 * Requires prebuilt candidate tarballs; never builds, links workspace code, hides
 * SDK resolution or installs ambient replacements. Native children and registry
 * listeners are scope-owned; retained output contains actual installations.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { consumerArtifacts } from "./consumer-artifacts.js";
import { consumerRegistry } from "./consumer-registry.js";
import { consumerInstallCommand } from "./consumer-install-command.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { PackedTypeCatalog } from "./consumer-packed-type.schemas.js";
import { packedTypeFixtures } from "./consumer-packed-type-fixtures.js";
import type { PackedTypeResult } from "./consumer-packed-type.types.js";
import {
  compilePackedTypes,
  verifyPackedTypeInstallation,
  writePackedTypeFixture,
} from "./consumer-packed-type-validation.js";

/**
 * Runs independent cases serially through one explicit installed Bun layout.
 * @param artifacts - Fresh candidate directory accepted by the shared registry.
 * @param output - External owned output directory, retained for evidence.
 * @param manager - Explicit hoisted or isolated Bun dependency layout.
 * @returns Lazy case results, with no fresh-pack or network failure converted to success.
 */
export const smokePackedTypeIsolation = Effect.fn("PackedTypes.smoke")(function* (
  artifacts: string,
  output: string,
  manager: "bun" | "bun-isolated",
) {
  const { candidate, registry, creatorArchive, catalog } = yield* packedTypeContext(
    artifacts,
    output,
  );
  const runner = yield* ScaffoldProcess;
  const results: PackedTypeResult[] = [];
  yield* inspectionNative("layout.create", () => mkdir(join(output, manager), { recursive: true }));
  yield* Effect.forEach(
    packedTypeFixtures(candidate.manifests, catalog.buildCatalog.dependencies),
    (fixture) =>
      Effect.gen(function* () {
        const root = join(output, manager, fixture.name);
        yield* inspectionNative("fixture.create", () => mkdir(root));
        yield* writePackedTypeFixture(root, fixture, catalog.buildCatalog, creatorArchive);
        const command = yield* consumerInstallCommand(
          manager,
          fixture,
          root,
          registry.url,
          join(output, "cache"),
        );
        const install = yield* runner.run(command);
        yield* inspectionNative("install.log", () => writeFile(join(root, "install.log"), install));
        const installation = yield* verifyPackedTypeInstallation(root, fixture);
        const cases = yield* compilePackedTypes(root, fixture);
        results.push({ name: fixture.name, manager, root, cases, installation });
        yield* inspectionNative("report.write", () =>
          writeFile(join(output, "report.json"), JSON.stringify(results, null, 2)),
        );
        yield* Effect.logInfo("Packed strict type consumer passed", {
          fixture: fixture.name,
          manager,
          cases,
        });
      }),
    { concurrency: 1, discard: true },
  );
  return results;
});

/**
 * Verifies candidate archive authority before acquiring the external consumer registry.
 * @param artifacts - Fresh exact tarball directory.
 * @param output - Owned external evidence root.
 * @returns Candidate metadata, selected native pins and a scope-owned registry.
 */
const packedTypeContext = Effect.fn("PackedTypes.context")(function* (
  artifacts: string,
  output: string,
) {
  const repository = resolve(import.meta.dir, "..");
  const location = relative(repository, output);
  if (
    location === "" ||
    (!isAbsolute(location) && location !== ".." && !location.startsWith("../"))
  )
    return yield* consumerInputFailure(
      "packed-types.output",
      "Packed consumer output must be outside the repository",
    );
  yield* inspectionNative("output.create", () => mkdir(output, { recursive: true }));
  const candidate = yield* consumerArtifacts(repository, output, artifacts);
  const registry = yield* consumerRegistry(output, candidate.tarballs, candidate.manifests);
  const creator = candidate.manifests.get("create-relkit")?.manifest;
  const creatorArchive = candidate.tarballs.get("create-relkit");
  if (creator === undefined || creatorArchive === undefined)
    return yield* consumerInputFailure(
      "packed-types.creator",
      "Candidate creator archive is required for native pins and exact patch bytes",
    );
  const catalog = yield* Schema.decodeUnknownEffect(PackedTypeCatalog)(creator.relkit);
  return { candidate, registry, creatorArchive, catalog };
});

if (import.meta.main) {
  const [artifacts, output, manager = "bun-isolated"] = process.argv.slice(2);
  if (
    artifacts === undefined ||
    output === undefined ||
    (manager !== "bun" && manager !== "bun-isolated")
  )
    throw new Error(
      "Usage: bun scripts/smoke-packed-type-isolation.ts <candidate-tarball-dir> <external-output-dir> [bun|bun-isolated]",
    );
  await Effect.runPromise(
    smokePackedTypeIsolation(resolve(artifacts), resolve(output), manager).pipe(
      Effect.provide(scaffoldProcessLayer),
      Effect.scoped,
    ),
  );
}
