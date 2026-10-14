/**
 * Assembles declaration-only application discovery after compiler layout validation.
 * The result keeps native specialized service metadata, actual boundaries and
 * provider declarations; no user module or live client is imported.
 */
import { join } from "node:path";
import { discoverApplicationLayout, type AstSourceModule } from "@relkit/compiler";
import * as ts from "typescript";
import type { ProjectDiscovery } from "./project-discovery-types.js";
import { readAppDiscovery } from "./project-discovery-app.js";
import { collectProjectArtifacts } from "./project-discovery-artifacts.js";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";

/**
 * Converts authored syntax into layout-aware scaffold discovery records.
 * @param root - Absolute application root.
 * @param appSource - Unevaluated configuration source.
 * @param modules - Complete sorted authored TypeScript source collection.
 * @returns Immutable service, artifact, provider and layout interpretation.
 * @throws AddScaffoldError when mixed/invalid service roots make mutation unsafe.
 */
export function discoveryFacts(
  root: string,
  appSource: string,
  modules: readonly AstSourceModule[],
): ProjectDiscovery {
  const layout = discoverApplicationLayout(modules, root);
  if (layout.issues.length)
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.invalidProject,
      layout.issues.map((issue) => `${issue.file}: ${issue.message}`).join("\n"),
    );
  const appPath = join(root, "relkit.config.ts");
  const { services, artifacts } = collectProjectArtifacts(root, modules);
  const app = readAppDiscovery(appSource, appPath, root);
  return Object.freeze({
    projectRoot: root,
    layout,
    packagePath: join(root, "package.json"),
    appPath,
    appFactory: app.factory,
    ...(app.envPath === undefined ? {} : { envPath: app.envPath }),
    services: Object.freeze(
      [...new Map(services.map((service) => [service.path, service])).values()].sort(byPath),
    ),
    artifacts: Object.freeze([...artifacts].sort(byPath)),
    profiles: Object.freeze(app.profiles),
    awsPulumiDeployment:
      importsPackage(appSource, appPath, "@relkit/aws") &&
      importsPackage(appSource, appPath, "@relkit/pulumi"),
  });
}

/**
 * Checks explicit declaration imports used to recognize configured deployment roles.
 * @param source - Unevaluated configuration module.
 * @param path - Physical source filename used by TypeScript syntax parsing.
 * @param packageName - Exact supported integration package to detect.
 * @returns Whether the module contains its explicit static import.
 */
function importsPackage(source: string, path: string, packageName: string): boolean {
  return ts
    .createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
    .statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === packageName,
    );
}

/**
 * Orders static records by their real portable source filenames.
 * @param left - First record.
 * @param right - Second record.
 * @returns Stable path ordering without changing logical IDs.
 */
function byPath(left: { path: string }, right: { path: string }): number {
  return left.path.localeCompare(right.path);
}
