/** Discovers workspace owners and native TypeScript import references without evaluating source. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import * as ts from "typescript";

import type {
  DependencyMap,
  PackageManifest,
  Scope,
  ImportReference,
} from "./boundary-imports.types.js";
export type { PackageManifest, Scope, ImportReference } from "./boundary-imports.types.js";

export const publicApplicationPackages = new Set([
  "@relkit/app",
  "relkit/agents",
  "relkit",
  "@relkit/better-auth",
  "relkit/buckets",
  "relkit/cache",
  "@relkit/client",
  "relkit/config",
  "@relkit/drizzle",
  "relkit/events",
  "relkit/functions",
  "relkit/jobs",
  "relkit/realtime",
  "relkit/routes",
  "relkit/schema",
  "relkit/services",
  "@relkit/testing",
  "relkit/tools",
]);

export const descriptorPackages = new Set(
  [...publicApplicationPackages].filter(
    (name) =>
      ![
        "@relkit/better-auth",
        "@relkit/client",
        "relkit/config",
        "@relkit/drizzle",
        "relkit/schema",
        "@relkit/testing",
      ].includes(name),
  ),
);

export const internalRuntimePackages = new Set([
  "relkit/engine",
  "relkit/inspector-api",
  "relkit/invocation",
  "relkit/observability",
  "relkit/providers-local",
  "relkit/runtime-effect",
  "relkit/runtime-hono",
  "@relkit/cli",
]);

/** Shared invocation contracts are internal, but descriptor packages may consume them. */
export const dependencyNeutralPackages = new Set(["relkit/invocation"]);

export const descriptorRuntimeDependencies = new Map<string, ReadonlySet<string>>([
  ["relkit/agents", new Set(["ai", "effect"])],
  ["relkit", new Set(["relkit/observability/telemetry", "effect"])],
  ["relkit/buckets", new Set(["effect"])],
  ["relkit/cache", new Set(["effect"])],
  ["relkit/events", new Set(["effect"])],
  ["relkit/functions", new Set(["effect"])],
  ["relkit/jobs", new Set(["effect"])],
  ["relkit/realtime", new Set(["effect"])],
  ["relkit/routes", new Set(["effect", "hono"])],
  ["relkit/services", new Set(["effect"])],
  ["relkit/tools", new Set(["effect"])],
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
    specifier.startsWith("@app/") ||
    specifier.startsWith("~/") ||
    /^[a-z][a-z+.-]*:/.test(specifier)
  ) {
    return undefined;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

/** Area-level owner of a module specifier: `relkit/<area>` for a `relkit` subpath.
 * @param specifier - Bare import specifier. @returns The owning package or `relkit` area. */
export function moduleOwnerName(specifier: string): string | undefined {
  const dependency = dependencyName(specifier);
  if (dependency !== "relkit" || specifier === "relkit") return dependency;
  const area = specifier.split("/")[1]!;
  if (area === "internal") return "relkit";
  return `relkit/${area === "tasks" ? "jobs" : area}`;
}

/** `relkit` area that owns a file inside the merged package, if any.
 * @param root - Repository root. @param file - Absolute file path.
 * @returns `relkit` for the application area, `relkit/<area>` for the others. */
export function relkitAreaOwner(root: string, file: string): string | undefined {
  const match = /^packages\/relkit\/(?:src|tests)\/([^/]+)\//.exec(
    relative(root, file).replaceAll("\\", "/"),
  );
  if (!match) return undefined;
  return match[1] === "app" ? "relkit" : `relkit/${match[1]}`;
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
    (internalRuntimePackages.has(dependency) && !dependencyNeutralPackages.has(dependency)) ||
    dependency === "effect" ||
    dependency.startsWith("@effect/") ||
    dependency === "hono" ||
    dependency.startsWith("@hono/") ||
    dependency === "next" ||
    dependency.startsWith("@pulumi/") ||
    dependency === "ai" ||
    dependency.startsWith("@ai-sdk/")
  );
}

export function isFixtureForbidden(dependency: string): boolean {
  if (dependency.startsWith("@relkit/app/")) return false;
  return (
    (dependency.startsWith("@relkit/") && !publicApplicationPackages.has(dependency)) ||
    dependency === "create-relkit" ||
    isFrameworkRuntime(dependency) ||
    dependency === "aws-sdk" ||
    dependency.startsWith("@aws-sdk/")
  );
}
