/** Synchronizes owning manifests, selected dependency metadata and starter catalogs through the release producers. */
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { workspacePackageDirectories } from "./workspace-packages.js";
import { packedTemplates } from "./release-templates.js";
import { buildCatalog, nativeBuildCatalogSource, patchRegistrations } from "./build-catalog.js";
import { dependencyFields, resolveCatalogVersion } from "./catalog-manifest.js";
import { generatorProviders } from "./release-plan.js";
import { synchronizeIntegrationDependencies } from "./integration-dependency-metadata.js";

const root = resolve(import.meta.dir, "..");
const repository = "https://github.com/rel-kit/relkit";
import { descriptions } from "./release-package-descriptions.js";
type TemplateManifest = Record<string, unknown> &
  Partial<Record<(typeof dependencyFields)[number], Record<string, string>>>;
const write = process.argv.includes("--write");
const stale: string[] = [];

async function syncJson(path: string, value: Record<string, unknown>): Promise<void> {
  await syncText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function syncText(path: string, output: string): Promise<void> {
  try {
    if ((await readFile(path, "utf8")) === output) return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (write) await writeFile(path, output);
  else stale.push(path);
}

const rootPath = join(root, "package.json");
const rootManifest = JSON.parse(await readFile(rootPath, "utf8")) as Record<string, unknown>;
await syncJson(rootPath, {
  ...rootManifest,
  patchedDependencies: patchRegistrations(rootManifest),
});
const catalog = await buildCatalog(root, rootManifest);
const metadataPackages = new Set(["@relkit/cli", "create-relkit", "@relkit/effect-mq"]);
const versions = new Map<string, string>();
for (const directory of workspacePackageDirectories(root)) {
  const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  versions.set(manifest.name, manifest.version);
}
for (const directory of workspacePackageDirectories(root)) {
  const path = join(directory, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const name = String(manifest.name);
  const relkitMetadata = synchronizeIntegrationDependencies(manifest, rootManifest);
  const description = descriptions[name];
  if (description === undefined) throw new Error(`Missing release description for ${name}`);
  const {
    name: _name,
    version,
    description: _description,
    license: _license,
    repository: _repository,
    homepage: _homepage,
    bugs: _bugs,
    files: _files,
    publishConfig: _publishConfig,
    engines: _engines,
    ...rest
  } = manifest;
  await syncJson(path, {
    name,
    version,
    description,
    license: "MIT",
    repository: {
      type: "git",
      url: `${repository}.git`,
      directory: relative(root, directory),
    },
    homepage: `${repository}#readme`,
    bugs: { url: `${repository}/issues` },
    files:
      name === "@relkit/cli"
        ? ["dist", "editor"]
        : name === "create-relkit"
          ? ["dist", "src/catalog-resolution.ts", "src/catalog-resolution.types.ts"]
          : ["dist"],
    publishConfig: { access: "public" },
    engines: { bun: ">=1.3.10" },
    ...rest,
    ...(relkitMetadata === undefined ? {} : { relkit: relkitMetadata }),
    ...(metadataPackages.has(name)
      ? {
          relkit: {
            ...relkitMetadata,
            buildCatalog: catalog,
            ...(name === "create-relkit"
              ? {
                  providerVersions: Object.fromEntries(
                    generatorProviders.flatMap((provider) => {
                      const version = versions.get(provider);
                      return version === undefined ? [] : [[provider, version]];
                    }),
                  ),
                }
              : {}),
          },
        }
      : {}),
  });
  if (name === "@relkit/effect-mq")
    await syncText(join(directory, "src/build-catalog.ts"), nativeBuildCatalogSource(catalog));
}

const version = versions.get("create-relkit");
if (version === undefined) throw new Error("Generator version is absent");
for (const template of packedTemplates) {
  const path = join(root, "templates", "default", "v1", template, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as TemplateManifest;
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith("@relkit/") || name === "create-relkit") {
        const dependencyVersion = versions.get(name);
        if (dependencyVersion === undefined)
          throw new Error(`Unknown template dependency: ${name}`);
        dependencies[name] = dependencyVersion;
      } else
        dependencies[name] =
          catalog.dependencies[name] ??
          resolveCatalogVersion(rootManifest, name, dependencies[name]);
    }
  }
  await syncJson(path, manifest);
}

const templateReadme = join(root, "templates", "default", "README.md");
const readme = await readFile(templateReadme, "utf8");
const nextReadme = readme.replace(
  /checked-in RelKit package version \(`[^`]+`\)/,
  `checked-in RelKit package version (\`${version}\`)`,
);
if (readme !== nextReadme) {
  if (write) await writeFile(templateReadme, nextReadme);
  else stale.push(templateReadme);
}

if (stale.length > 0)
  throw new Error(
    `Release metadata is stale; run bun run release:sync:\n${stale.map((path) => path.replace(`${root}/`, "")).join("\n")}`,
  );
