import { join } from "node:path";
import { prefilterSources } from "@relkit/compiler";
import * as ts from "typescript";
import type {
  DiscoveredArtifact,
  DiscoveredService,
  ProjectDiscovery,
} from "./project-discovery-types.js";
import { readAppDiscovery } from "./project-discovery-app.js";
import { discoverDatabaseDetails } from "./project-discovery-database.js";
import { readFactoryObject, readFactoryStringProperty, staticPropertyName } from "./source-edit.js";

/**
 * Converts immutable source facts into discovery data without importing application modules.
 * @param root - Absolute project root.
 * @param appSource - Configuration source bytes.
 * @param modules - Sorted TypeScript source modules.
 * @returns Canonical service, artifact, profile and deployment facts.
 */
export function discoveryFacts(
  root: string,
  appSource: string,
  modules: readonly { readonly fileName: string; readonly text: string }[],
): ProjectDiscovery {
  const appPath = join(root, "relkit.config.ts");
  const candidates = prefilterSources(modules, { projectRoot: root }).candidates;
  const sourceByPath = new Map(modules.map((module) => [module.fileName, module.text]));
  const services: DiscoveredService[] = [];
  const artifacts: DiscoveredArtifact[] = [];
  for (const candidate of candidates) {
    const domain = sourceDomain(candidate.fileName);
    const source = sourceByPath.get(candidate.fileName);
    // Compiler candidates are drawn only from the exact source module collection above.
    if (source === undefined) throw new Error("Compiler returned an unknown source module.");
    for (const factory of candidate.facts.factoryBindings) {
      const binding = factory.binding ?? fileBinding(candidate.fileName);
      const exportedEntry = [...candidate.facts.exports.entries()].find(
        ([, entry]) => entry.binding === factory.binding || entry.factory === factory,
      );
      const id =
        factory.id === "explicit"
          ? readFactoryStringProperty(
              source,
              candidate.fileName,
              factory.factory,
              "id",
              factory.factory === "definePrompt" || factory.factory === "defineConstants" ? 1 : 0,
            )
          : undefined;
      artifacts.push({
        kind: factory.kind,
        path: candidate.fileName,
        binding,
        ...(domain === undefined ? {} : { domain }),
        ...(id === undefined ? {} : { id }),
        factory: factory.factory,
        exported: exportedEntry !== undefined,
        ...(exportedEntry === undefined
          ? {}
          : {
              exportKind:
                exportedEntry[0] === "default" ? ("default" as const) : ("named" as const),
            }),
        options: factory.options,
      });
      if (factory.kind !== "service" || domain === undefined) continue;
      const database =
        factory.factory === "defineDrizzleService"
          ? discoverDatabaseDetails(modules, candidate.fileName, source)
          : undefined;
      services.push({
        domain,
        path: candidate.fileName,
        binding,
        capability:
          factory.factory === "defineDrizzleService"
            ? "database"
            : factory.factory === "defineBetterAuthService"
              ? "auth"
              : "generic",
        ...(database ?? {}),
        members: serviceMembers(
          candidate.facts.serviceMembers.filter((member) => member.service === factory.binding),
          source,
          candidate.fileName,
          factory.factory,
        ),
      });
    }
  }
  const app = readAppDiscovery(appSource, appPath, root);
  return Object.freeze({
    projectRoot: root,
    packagePath: join(root, "package.json"),
    appPath,
    appFactory: app.factory,
    ...(app.envPath === undefined ? {} : { envPath: app.envPath }),
    services: Object.freeze(
      [...new Map(services.map((service) => [service.path, service])).values()].sort(byPath),
    ),
    artifacts: Object.freeze(artifacts.sort(byPath)),
    profiles: Object.freeze(app.profiles),
    awsPulumiDeployment:
      importsPackage(appSource, appPath, "@relkit/aws") &&
      importsPackage(appSource, appPath, "@relkit/pulumi"),
  });
}

/**
 * Reads public service members from compiler facts or the supported AST fallback.
 * @param facts - Compiler member facts.
 * @param source - Owning module source.
 * @param path - Source module path.
 * @param factory - Service factory identifier.
 * @returns Declared public member bindings.
 */
function serviceMembers(
  facts: readonly { readonly member: string; readonly targetBinding?: string }[],
  source: string,
  path: string,
  factory: string,
) {
  if (facts.length > 0)
    return facts.map((member) => ({
      name: member.member,
      ...(member.targetBinding === undefined ? {} : { targetBinding: member.targetBinding }),
    }));
  const root = readFactoryObject(source, path, [factory]);
  return ["functions", "events", "tasks", "jobs"].flatMap((category) => {
    const item = root.properties.find((item) => staticPropertyName(item.name) === category);
    if (!item || !ts.isPropertyAssignment(item)) return [];
    const value = unwrap(item.initializer);
    if (!value || !ts.isObjectLiteralExpression(value)) return [];
    return value.properties.flatMap((member) => {
      const name = staticPropertyName(member.name);
      if (name === undefined) return [];
      const targetBinding = ts.isShorthandPropertyAssignment(member)
        ? member.name.text
        : ts.isPropertyAssignment(member) && ts.isIdentifier(member.initializer)
          ? member.initializer.text
          : undefined;
      return [{ name, ...(targetBinding === undefined ? {} : { targetBinding }) }];
    });
  });
}

/**
 * Removes parentheses and TypeScript assertions from a source expression.
 * @param value - AST expression whose static wrapper nodes are ignored.
 * @returns The underlying expression, or undefined when no expression was supplied.
 */
function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  return value &&
    (ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isParenthesizedExpression(value))
    ? unwrap(value.expression)
    : value;
}

/**
 * Extracts a canonical domain from a source-relative path.
 * @param path - Path inside the current project or owned resource.
 * @returns The owning src domain, excluding routes/platform, or undefined outside a domain.
 */
function sourceDomain(path: string): string | undefined {
  const [src, domain] = path.replaceAll("\\", "/").split("/");
  return src === "src" && domain && domain !== "routes" && domain !== "platform"
    ? domain
    : undefined;
}

/**
 * Checks declaration-only imports for deployment ownership.
 * @param source - Authored source text inspected or transformed without execution.
 * @param path - Path inside the current project or owned resource.
 * @param packageName - Dependency name matched in static source imports.
 * @returns Whether source contains a static import for the named package.
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
 * Derives the existing fallback binding from a module filename.
 * @param path - Path inside the current project or owned resource.
 * @returns The camel-case source stem, with artifact as the missing-filename fallback.
 */
function fileBinding(path: string): string {
  return (path.split("/").at(-1)?.split(".")[0] ?? "artifact").replace(
    /-([a-z0-9])/g,
    (_, value: string) => value.toUpperCase(),
  );
}

/**
 * Orders pure discovery facts by canonical source path.
 * @param left - First value in deterministic comparison.
 * @param right - Second value in deterministic comparison.
 * @returns Negative, zero or positive ordering of source paths.
 */
function byPath(left: { path: string }, right: { path: string }): number {
  return left.path.localeCompare(right.path);
}
