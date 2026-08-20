import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import * as ts from "typescript";

type DependencyMap = Record<string, string>;

export type PackageManifest = {
  name?: string;
  workspaces?: string[];
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
};

export type Scope = {
  root: string;
  path: string;
  manifest?: PackageManifest;
  declaredDependencies: Set<string>;
};

export type ImportReference = {
  specifier: string;
  position: number;
};

export const publicApplicationPackages = new Set([
  "@zsys/agents",
  "@zsys/app",
  "@zsys/buckets",
  "@zsys/cache",
  "@zsys/config",
  "@zsys/events",
  "@zsys/functions",
  "@zsys/jobs",
  "@zsys/routes",
  "@zsys/schema",
  "@zsys/testing",
  "@zsys/tools",
]);

export const descriptorPackages = new Set(
  [...publicApplicationPackages].filter(
    (name) => !["@zsys/config", "@zsys/schema", "@zsys/testing"].includes(name),
  ),
);

export const internalRuntimePackages = new Set([
  "@zsys/cloud-aws",
  "@zsys/deploy-pulumi",
  "@zsys/engine",
  "@zsys/inspector-api",
  "@zsys/observability",
  "@zsys/providers-local",
  "@zsys/runtime-effect",
  "@zsys/runtime-hono",
  "@zsys/supervisor",
]);

export const nodeBuiltins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

export function readManifest(path: string): PackageManifest | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PackageManifest) : undefined;
}

function declaredDependencies(manifest?: PackageManifest): Set<string> {
  return new Set(
    [
      ...Object.keys(manifest?.dependencies ?? {}),
      ...Object.keys(manifest?.devDependencies ?? {}),
      ...Object.keys(manifest?.optionalDependencies ?? {}),
      ...Object.keys(manifest?.peerDependencies ?? {}),
    ].sort(),
  );
}

export function discoverScopes(root: string, rootManifest: PackageManifest): Scope[] {
  const paths = new Set<string>();
  for (const pattern of [...(rootManifest.workspaces ?? []), "templates/*", "scripts"]) {
    for (const path of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: false })) {
      paths.add(path);
    }
  }
  return [...paths]
    .filter((path) => statSync(resolve(root, path)).isDirectory())
    .sort()
    .map((path) => {
      const manifest =
        path === "scripts" ? rootManifest : readManifest(resolve(root, path, "package.json"));
      return {
        root: resolve(root, path),
        path,
        ...(manifest ? { manifest } : {}),
        declaredDependencies: declaredDependencies(manifest),
      };
    });
}

export function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function dependencyName(specifier: string): string | undefined {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("~/") ||
    /^[a-z][a-z+.-]*:/.test(specifier)
  ) {
    return undefined;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

export function importReferences(sourceFile: ts.SourceFile): ImportReference[] {
  const references: ImportReference[] = [];
  const add = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ specifier: node.text, position: node.getStart(sourceFile) });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      add(node.arguments[0]);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

export function isFrameworkRuntime(dependency: string): boolean {
  return (
    internalRuntimePackages.has(dependency) ||
    dependency === "effect" ||
    dependency.startsWith("@effect/") ||
    dependency === "hono" ||
    dependency.startsWith("@hono/") ||
    dependency === "next" ||
    dependency.startsWith("@pulumi/")
  );
}

export function isFixtureForbidden(dependency: string): boolean {
  if (dependency === "@zsys/app/config") return false;
  return (
    (dependency.startsWith("@zsys/") && !publicApplicationPackages.has(dependency)) ||
    dependency === "create-zsys" ||
    isFrameworkRuntime(dependency) ||
    dependency === "aws-sdk" ||
    dependency.startsWith("@aws-sdk/")
  );
}
