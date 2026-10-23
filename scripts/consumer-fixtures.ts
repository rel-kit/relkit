/**
 * Defines the external install matrix from actual packed starter manifests and
 * independent package versions. These install-only fixtures measure footprint;
 * they do not bypass or grant public creation/functional certification.
 */
import { Effect, Schema } from "effect";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { ConsumerManifest } from "./consumer-installation.schemas.js";
import type { Manifest } from "./scaffold-process.types.js";
import type { ConsumerFixture } from "./consumer-benchmark.types.js";

/**
 * Requires the current independently versioned candidate for one package.
 * @param name - Selected first-party package.
 * @param manifests - Authoritative current candidate declarations.
 * @returns Exact candidate version; absence is an invariant violation.
 */
function version(name: string, manifests: ReadonlyMap<string, { readonly manifest: Manifest }>) {
  const value = manifests.get(name)?.manifest.version;
  if (value === undefined) throw new Error(`Candidate fixture package is absent: ${name}`);
  return value;
}

/**
 * Extracts a real packed starter's dependency declarations.
 * @param archive - Exact creator tarball.
 * @param variant - Published template identity.
 * @returns Lazy decoded packed manifest; missing templates fail visibly.
 */
const packedStarter = Effect.fn("ConsumerFixtures.starter")(function* (
  archive: string,
  variant: string,
) {
  const path = `package/dist/templates/default/v1/${variant}/package.json`;
  const bytes = yield* inspectionNative("fixture.archive", () => Bun.file(archive).bytes());
  const files = yield* inspectionNative("fixture.template", () =>
    new Bun.Archive(bytes).files(path),
  );
  const file = files.get(path);
  if (file === undefined)
    return yield* consumerInputFailure("fixture.template", `Packed starter is absent: ${variant}`);
  const text = yield* inspectionNative("fixture.manifest", () => file.text());
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ConsumerManifest))(text);
});

/** Reads the native listener's required Bun typings from the published starter.
 * @param creator - Exact packed creator owning the native runtime version.
 * @returns Required development type version, failing if the starter omits it.
 */
const packedBunTypes = Effect.fn("ConsumerFixtures.bunTypes")(function* (creator: string) {
  const minimal = yield* packedStarter(creator, "minimal");
  const bunTypes = minimal.devDependencies?.["@types/bun"];
  if (bunTypes === undefined)
    return yield* consumerInputFailure("fixture.types", "Packed starter Bun typings are absent");
  return bunTypes;
});

/**
 * Derives six baseline categories plus individually selected integration fixtures.
 * @param creator - Exact creator tarball owning the starter manifests.
 * @param manifests - All current first-party identities used by the private registry.
 * @returns Lazy complete install matrix with no workspace/path dependency rewrite.
 */
export const consumerFixtures = Effect.fn("ConsumerFixtures.matrix")(function* (
  creator: string,
  manifests: ReadonlyMap<string, { readonly directory: string; readonly manifest: Manifest }>,
) {
  const bunTypes = yield* packedBunTypes(creator);
  const fixtures: ConsumerFixture[] = [];
  for (const name of ["create-relkit", "relkit"])
    fixtures.push({
      name: name === "relkit" ? "wrapper-only" : "creator-only",
      dependencies: { [name]: version(name, manifests) },
      devDependencies: {},
      production: false,
    });
  for (const name of ["minimal", "api", "agent"]) {
    const manifest = yield* packedStarter(creator, name);
    fixtures.push({
      name: `${name}-development`,
      dependencies: manifest.dependencies ?? {},
      devDependencies: manifest.devDependencies ?? {},
      production: false,
    });
    if (name === "minimal")
      fixtures.push({
        name: "production-only",
        dependencies: manifest.dependencies ?? {},
        devDependencies: manifest.devDependencies ?? {},
        production: true,
      });
  }
  fixtures.push({
    name: "generic-server-client",
    dependencies: { "@relkit/client": version("@relkit/client", manifests) },
    devDependencies: {},
    production: false,
  });
  fixtures.push({
    name: "general-testing",
    dependencies: { "@relkit/testing": version("@relkit/testing", manifests) },
    devDependencies: { "@types/bun": bunTypes },
    production: false,
  });
  for (const [name, item] of manifests)
    if (item.directory.includes("/integrations/packages/"))
      fixtures.push({
        name: `integration-${name.slice("@relkit/".length)}`,
        dependencies: { [name]: version(name, manifests) },
        devDependencies: {},
        production: false,
      });
  return fixtures;
});
