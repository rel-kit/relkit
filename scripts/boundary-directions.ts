import { relative, resolve } from "node:path";
import { discoverScopes, readManifest, type Scope } from "./boundary-imports";

export type DirectionViolation = {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
};

const coreProtocols = new Set([
  "@relkit/agents",
  "@relkit/buckets",
  "@relkit/cache",
  "@relkit/contracts",
  "@relkit/deploy",
  "@relkit/local-service",
  "@relkit/observability",
  "@relkit/provider",
]);

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
    for (const dependency of owner.declaredDependencies) {
      let rule: string | undefined;
      let message: string | undefined;
      if (owner.manifest?.name === "@relkit/engine" && dependency === "@relkit/providers-local") {
        rule = "engine-local-provider-dependency";
        message = "@relkit/engine depends on local provider implementations";
      } else if (
        owner.path.startsWith("packages/") &&
        (dependency === "@relkit/integrations" || integrations.has(dependency))
      ) {
        rule = "core-integration-dependency";
        message = `${owner.manifest?.name} depends on integration package "${dependency}"`;
      } else if (
        owner.path.startsWith("integrations/packages/") &&
        dependency.startsWith("@relkit/") &&
        !coreProtocols.has(dependency)
      ) {
        rule = "integration-non-protocol-dependency";
        message = `${owner.manifest?.name} depends on non-protocol package "${dependency}"`;
      } else if (owner.path === "integrations/catalog" && !integrations.has(dependency)) {
        rule = "catalog-non-integration-dependency";
        message = `@relkit/integrations depends on non-integration package "${dependency}"`;
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
