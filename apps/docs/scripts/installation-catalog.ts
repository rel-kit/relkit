/**
 * Loads validated owner manifests and resolves selected installation declarations.
 * This docs-only producer reads metadata without importing integration runtimes.
 * Promise loading is the generator boundary; selection itself is pure and rejects
 * missing owners, peers or conflicting versions rather than dropping requirements.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { selectedIntegrationRequirements } from "@relkit/contracts";
import { resolveCatalogVersion } from "create-relkit/catalog-resolution";
import { scaffoldDependency } from "create-relkit/internal/scaffold-catalog";
import { Effect, Schema } from "effect";
import { HTTP_TRANSPORT_REQUIREMENTS } from "../../../packages/runtime-hono/src/selected-transports.js";
import { apiPackageDefinitions } from "./documentation-catalog.js";
import * as Schemas from "./installation-catalog.schemas.js";
import type {
  InstallationCatalog,
  InstallationDeclarations,
  InstallationManifest,
  InstallationRecipe,
  InstallationSelection,
} from "./installation-catalog.types.js";

/** Loads package-owned metadata once, with bounded independent file reads.
 * @param root - Repository root whose docs are being generated.
 * @returns Decoded manifests and catalogs, or a rejected metadata/read failure.
 */
export function loadInstallationCatalog(root: string): Promise<InstallationCatalog> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const workspace = yield* Effect.tryPromise(async () =>
        Schema.decodeUnknownSync(Schemas.InstallationWorkspace)(
          JSON.parse(await readFile(resolve(root, "package.json"), "utf8")),
        ),
      );
      const paths = [
        ...apiPackageDefinitions.map(({ directory }) => directory),
        "packages/cli",
        "packages/runtime-hono",
        "packages/create-relkit",
      ];
      const manifests = yield* Effect.forEach(
        paths,
        (directory) =>
          Effect.tryPromise(async () =>
            Schema.decodeUnknownSync(Schemas.InstallationManifest)(
              JSON.parse(await readFile(resolve(root, directory, "package.json"), "utf8")),
            ),
          ),
        { concurrency: 4 },
      );
      return {
        workspace,
        packages: new Map(manifests.map((manifest) => [manifest.name, manifest])),
      };
    }),
  );
}

/** Resolves one selected workflow into application-owned manifest sections.
 * @param recipe - Selected adapter, capability and leaf choices.
 * @param catalog - Decoded owner metadata; no integration code is evaluated.
 * @returns Runtime and development declarations without unselected optional peers.
 */
export function installationDeclarations(
  recipe: InstallationRecipe,
  catalog: InstallationCatalog,
): InstallationDeclarations {
  const declarations = {
    dependencies: {} as Record<string, string>,
    devDependencies: {} as Record<string, string>,
  };
  for (const selection of recipe.selections) selectDeclarations(selection, catalog, declarations);
  if (recipe.drizzlePatch) {
    addDeclaration(
      declarations,
      "devDependencies",
      "create-relkit",
      owner(catalog, "create-relkit").version,
    );
  }
  for (const name of recipe.tools ?? []) {
    const tool = scaffoldDependency(name);
    addDeclaration(declarations, tool.section, name, tool.version);
  }
  return declarations;
}

/** Resolves one owner and the capability/phase intersection it actually selects.
 * @param selection - Selected package and public leaf.
 * @param catalog - Validated metadata snapshot.
 * @param declarations - Current recipe result; conflicting declarations throw.
 * @returns Normally after the selected owner and peer declarations are added.
 */
function selectDeclarations(
  selection: InstallationSelection,
  catalog: InstallationCatalog,
  declarations: InstallationDeclarations,
): void {
  const manifest = owner(catalog, selection.name);
  const section = selection.section ?? "dependencies";
  if (selection.includeOwner !== false)
    addDeclaration(declarations, section, manifest.name, manifest.version);
  const requirements =
    selection.name === "@relkit/runtime-hono"
      ? HTTP_TRANSPORT_REQUIREMENTS
      : (manifest.relkit?.integration?.dependencies ?? []);
  for (const capability of selection.capabilities ?? [])
    if (!requirements.some((requirement) => requirement.capabilities.includes(capability)))
      throw new Error(`Missing installation capability ${capability} in ${manifest.name}.`);
  for (const phase of selection.phases ?? ["runtime", "check", "build"])
    for (const requirement of selectedIntegrationRequirements(
      requirements,
      selection.capabilities ?? [],
      phase,
    ))
      addDeclaration(
        declarations,
        requirement.installSection,
        requirement.package,
        requirement.supportedRange,
      );
  for (const name of selection.peers ?? []) {
    const spec = manifest.peerDependencies?.[name];
    if (spec === undefined) throw new Error(`Missing selected peer ${name} in ${manifest.name}.`);
    addDeclaration(
      declarations,
      section,
      name,
      resolveCatalogVersion({ ...catalog.workspace }, name, spec),
    );
  }
  if (selection.name === "@relkit/runtime-hono")
    for (const requirement of requirements)
      if (manifest.peerDependencies?.[requirement.package] !== requirement.supportedRange)
        throw new Error(`HTTP SDK metadata disagrees with optional peer ${requirement.package}.`);
}

/** Requires an explicit package owner instead of inventing a shared release version.
 * @param catalog - Decoded owner metadata.
 * @param name - Exact package identity selected by a recipe.
 * @returns Its manifest; missing identities throw at generation time.
 */
function owner(catalog: InstallationCatalog, name: string): InstallationManifest {
  const manifest = catalog.packages.get(name);
  if (!manifest) throw new Error(`Missing installation owner: ${name}.`);
  return manifest;
}

/** Adds an idempotent declaration and refuses section/version disagreement.
 * @param declarations - Mutable result allocated by the pure recipe resolver.
 * @param section - Owner-selected manifest section.
 * @param name - Selected package identity.
 * @param version - Owner-supplied version/range.
 * @returns Normally after adding or confirming the idempotent declaration.
 */
function addDeclaration(
  declarations: InstallationDeclarations,
  section: "dependencies" | "devDependencies",
  name: string,
  version: string,
): void {
  const current = declarations[section][name];
  const other = section === "dependencies" ? "devDependencies" : "dependencies";
  if ((current !== undefined && current !== version) || declarations[other][name] !== undefined)
    throw new Error(`Conflicting installation requirement: ${name}.`);
  Object.assign(declarations[section], { [name]: version });
}
