import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import * as ts from "typescript";
import {
  dependencyName,
  descriptorPackages,
  discoverScopes,
  importReferences,
  internalRuntimePackages,
  isFixtureForbidden,
  isFrameworkRuntime,
  isWithin,
  nodeBuiltins,
  publicApplicationPackages,
  readManifest,
} from "./boundary-imports";
import { scanScope } from "./scope-scan";
import type { ImportReference, Scope } from "./boundary-imports";

type Violation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};

function reportImport(
  root: string,
  scopes: Scope[],
  owner: Scope,
  file: string,
  sourceFile: ts.SourceFile,
  reference: ImportReference,
): Violation[] {
  const dependency = dependencyName(reference.specifier);
  const ownerName = owner.manifest?.name ?? owner.path;
  const location = sourceFile.getLineAndCharacterOfPosition(reference.position);
  const base = {
    file: relative(root, file),
    line: location.line + 1,
    column: location.character + 1,
  };
  const violations: Violation[] = [];
  const add = (rule: string, message: string): void => {
    violations.push({ ...base, rule, message });
  };

  if (reference.specifier.startsWith(".")) {
    const target = resolve(dirname(file), reference.specifier);
    const targetScope = scopes.find((scope) => scope !== owner && isWithin(scope.root, target));
    if (targetScope) {
      add(
        "cross-package-relative-import",
        `${ownerName} imports ${targetScope.manifest?.name ?? targetScope.path} through "${reference.specifier}"`,
      );
    }
  }
  if (!dependency) return violations;
  if (
    owner.manifest &&
    dependency !== owner.manifest.name &&
    dependency !== "bun" &&
    !(reference.specifier === "mdx/types" && owner.declaredDependencies.has("@types/mdx")) &&
    !nodeBuiltins.has(dependency) &&
    !owner.declaredDependencies.has(dependency)
  ) {
    add(
      "undeclared-dependency",
      `${ownerName} imports undeclared dependency "${dependency}" via "${reference.specifier}"`,
    );
  }
  if (descriptorPackages.has(ownerName) && isFrameworkRuntime(dependency)) {
    add("descriptor-runtime-import", `${ownerName} imports runtime package "${dependency}"`);
  }
  if (
    ownerName === "@zsys/graph" &&
    (dependency === "hono" ||
      dependency.startsWith("@hono/") ||
      dependency === "@zsys/runtime-hono" ||
      dependency.startsWith("@pulumi/") ||
      dependency === "@zsys/deploy-pulumi" ||
      dependency === "@zsys/cloud-aws")
  ) {
    add("graph-hono-pulumi-import", `@zsys/graph imports Hono/Pulumi package "${dependency}"`);
  }
  const fixturePackage = scopes.find((scope) => scope.path === "examples/commerce")?.manifest?.name;
  if (
    owner.path === "apps/inspector" &&
    (publicApplicationPackages.has(dependency) ||
      internalRuntimePackages.has(dependency) ||
      dependency === fixturePackage ||
      dependency === "effect" ||
      dependency.startsWith("@effect/") ||
      dependency === "hono" ||
      dependency.startsWith("@hono/") ||
      dependency.startsWith("@pulumi/"))
  ) {
    add(
      "inspector-runtime-application-import",
      `apps/inspector imports runtime/application package "${dependency}"`,
    );
  }
  if (
    (owner.path === "examples/commerce" || owner.path.startsWith("templates/")) &&
    isFixtureForbidden(dependency)
  ) {
    add(
      "fixture-template-internal-import",
      `${owner.path} imports internal package "${dependency}"`,
    );
  }
  return violations;
}

function checkBoundaries(root: string): { files: number; roots: number; violations: Violation[] } {
  const rootManifest = readManifest(resolve(root, "package.json"));
  if (!rootManifest?.workspaces) throw new Error(`No workspace manifest found at ${root}`);
  const scopes = discoverScopes(root, rootManifest);
  const violations: Violation[] = [];
  let files = 0;

  for (const owner of scopes) {
    const paths = [...new Bun.Glob("**/*.{ts,tsx,mts,cts}").scanSync({ cwd: owner.root })]
      .filter((path) => !/(^|\/)(dist|node_modules|\.turbo|\.zsys)(\/|$)/.test(path))
      .sort();
    for (const path of paths) {
      const file = resolve(owner.root, path);
      const sourceFile = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      files += 1;
      for (const reference of importReferences(sourceFile)) {
        violations.push(...reportImport(root, scopes, owner, file, sourceFile, reference));
      }
    }
  }
  violations.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.rule}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.rule}`,
    ),
  );
  return { files, roots: scopes.length, violations };
}

function main(): void {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dir, ".."));
  const result = checkBoundaries(root);
  const violations = [...result.violations, ...scanScope(root)];
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`,
    );
  }
  if (violations.length > 0) {
    console.error(`Boundary/scope check failed with ${violations.length} violation(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Boundary check passed (${result.roots} roots, ${result.files} TypeScript files).`);
}

main();
