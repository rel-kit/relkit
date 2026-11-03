/** Checks installed dependency directions between the core package, tools and integrations; area rules live in boundary-areas.ts. */
import { relative, resolve } from "node:path";
import { discoverScopes, readManifest, type Scope } from "./boundary-imports";

export type DirectionViolation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};

export function integrationPackageNames(scopes: readonly Scope[]): Set<string> {
  return new Set(
    scopes
      .filter((scope) => scope.path.startsWith("integrations/packages/"))
      .flatMap((scope) => (scope.manifest?.name ? [scope.manifest.name] : [])),
  );
}

export function repositoryIntegrationPackageNames(root: string): Set<string> {
  const manifest = readManifest(resolve(root, "package.json"));
  return manifest?.workspaces
    ? integrationPackageNames(discoverScopes(root, manifest))
    : new Set<string>();
}

export function dependencyDirectionViolations(
  root: string,
  scopes: readonly Scope[],
): DirectionViolation[] {
  const integrations = integrationPackageNames(scopes);
  const violations: DirectionViolation[] = [];
  for (const owner of scopes) {
    // Development fixtures and optional peers do not create an installed runtime edge.
    const manifest = owner.manifest;
    const runtimeDependencies = new Set([
      ...Object.keys(manifest?.dependencies ?? {}),
      ...Object.keys(manifest?.optionalDependencies ?? {}),
      ...Object.keys(manifest?.peerDependencies ?? {}).filter(
        (name) => manifest?.peerDependenciesMeta?.[name]?.optional !== true,
      ),
    ]);
    for (const dependency of runtimeDependencies) {
      let rule: string | undefined;
      let message: string | undefined;
      if (owner.path.startsWith("packages/") && integrations.has(dependency)) {
        rule = "core-integration-dependency";
        message = `${owner.manifest?.name} depends on integration package "${dependency}"`;
      } else if (
        owner.path.startsWith("integrations/packages/") &&
        dependency.startsWith("@relkit/")
      ) {
        // Integrations build on relkit only; which relkit areas they use is an import rule.
        rule = "integration-non-protocol-dependency";
        message = `${owner.manifest?.name} depends on non-protocol package "${dependency}"`;
      }
      if (rule && message) {
        violations.push({
          file: relative(root, resolve(owner.root, "package.json")),
          line: 1,
          column: 1,
          rule,
          message,
        });
      }
    }
  }
  return violations;
}
