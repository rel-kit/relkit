import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prefilterSources } from "@relkit/compiler";
import * as ts from "typescript";
import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";
import type {
  DiscoveredArtifact,
  DiscoveredService,
  ProjectDiscovery,
} from "./project-discovery-types.js";
import { readAppDiscovery } from "./project-discovery-app.js";
import { discoverDatabaseDetails } from "./project-discovery-database.js";
import { readFactoryObject, readFactoryStringProperty, staticPropertyName } from "./source-edit.js";
/** Discovers canonical RELKIT source facts without importing application code. */
export async function discoverProject(projectRoot: string): Promise<ProjectDiscovery> {
  const root = resolve(projectRoot);
  const packagePath = join(root, "package.json");
  const appPath = join(root, "relkit.config.ts");
  let appSource: string;
  try {
    await readFile(packagePath, "utf8");
    appSource = await readFile(appPath, "utf8");
  } catch {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.invalidProject,
      `${root} is not a RELKIT project (package.json and relkit.config.ts are required).`,
    );
  }
  const paths = await Array.fromAsync(new Bun.Glob("src/**/*.ts").scan({ cwd: root }));
  const modules = await Promise.all(
    paths
      .sort()
      .map(async (path) => ({ fileName: path, text: await readFile(join(root, path), "utf8") })),
  );
  const candidates = prefilterSources(modules, { projectRoot: root }).candidates;
  const sourceByPath = new Map(modules.map((module) => [module.fileName, module.text]));
  const services: DiscoveredService[] = [];
  const artifacts: DiscoveredArtifact[] = [];
  for (const candidate of candidates) {
    const domain = sourceDomain(candidate.fileName);
    for (const factory of candidate.facts.factoryBindings) {
      const binding = factory.binding ?? fileBinding(candidate.fileName);
      const exportedEntry = [...candidate.facts.exports.entries()].find(
        ([, entry]) => entry.binding === factory.binding || entry.factory === factory,
      );
      artifacts.push({
        kind: factory.kind,
        path: candidate.fileName,
        ...(domain === undefined ? {} : { domain }),
        binding,
        ...optional(
          "id",
          factory.id === "explicit"
            ? readFactoryStringProperty(
                sourceByPath.get(candidate.fileName)!,
                candidate.fileName,
                factory.factory,
                "id",
                factory.factory === "definePrompt" || factory.factory === "defineConstants" ? 1 : 0,
              )
            : undefined,
        ),
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
          ? discoverDatabaseDetails(
              modules,
              candidate.fileName,
              sourceByPath.get(candidate.fileName)!,
            )
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
          sourceByPath.get(candidate.fileName)!,
          candidate.fileName,
          factory.factory,
        ),
      });
    }
  }
  const app = readAppDiscovery(appSource, appPath, root);
  return Object.freeze({
    projectRoot: root,
    packagePath,
    appPath,
    appFactory: app.factory,
    ...optional("envPath", app.envPath),
    services: Object.freeze(uniqueServices(services)),
    artifacts: Object.freeze(artifacts.sort(byPath)),
    profiles: Object.freeze(app.profiles),
    awsPulumiDeployment:
      importsPackage(appSource, appPath, "@relkit/aws") &&
      importsPackage(appSource, appPath, "@relkit/pulumi"),
  });
}

function serviceMembers(
  facts: readonly { readonly member: string; readonly targetBinding?: string }[],
  source: string,
  path: string,
  factory: string,
) {
  if (facts.length > 0) {
    return facts.map((member) => ({
      name: member.member,
      ...optional("targetBinding", member.targetBinding),
    }));
  }
  const root = readFactoryObject(source, path, [factory]);
  return ["functions", "events"].flatMap((category) => {
    const item = objectProperty(root, category);
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
      return [{ name, ...optional("targetBinding", targetBinding) }];
    });
  });
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((item) => staticPropertyName(item.name) === name);
}
function unwrap(value: ts.Expression | undefined): ts.Expression | undefined {
  return value &&
    (ts.isAsExpression(value) ||
      ts.isSatisfiesExpression(value) ||
      ts.isParenthesizedExpression(value))
    ? unwrap(value.expression)
    : value;
}
function sourceDomain(path: string): string | undefined {
  const [src, domain] = path.replaceAll("\\", "/").split("/");
  return src === "src" && domain && domain !== "routes" && domain !== "platform"
    ? domain
    : undefined;
}
function importsPackage(source: string, path: string, packageName: string): boolean {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return file.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === packageName,
  );
}
function fileBinding(path: string): string {
  return path
    .split("/")
    .at(-1)!
    .split(".")[0]!
    .replace(/-([a-z0-9])/g, (_, value: string) => value.toUpperCase());
}
function uniqueServices(values: readonly DiscoveredService[]): DiscoveredService[] {
  return [...new Map(values.map((value) => [value.path, value])).values()].sort(byPath);
}
function byPath(left: { path: string }, right: { path: string }): number {
  return left.path.localeCompare(right.path);
}
function optional<Name extends string, Value>(
  name: Name,
  value: Value | undefined,
): { readonly [Key in Name]?: Value } {
  return value === undefined ? {} : ({ [name]: value } as { readonly [Key in Name]: Value });
}
