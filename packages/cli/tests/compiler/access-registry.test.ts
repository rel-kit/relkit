/**
 * The generated context registry carries the role and permission names of the application's
 * Better Auth access control, so function access rules are typed by them.
 */
import { expect, it } from "vitest";
import { generateContextRegistry } from "../../src/compiler/context-registry.js";

const service = (exportName: string, kind: string) => ({
  exportName,
  reference: { module: `src/services/${exportName}/service.ts` },
  descriptor: { kind: "service", id: exportName, metadata: { capability: { kind } } },
});

it("declares the access names from the Better Auth service's handler", () => {
  const registry = generateContextRegistry([service("auth", "better-auth")] as never, {
    projectRoot: "/app",
  });
  expect(registry).toContain(
    'type RelkitApplicationAccess = import("@relkit/better-auth").InferBetterAuthAccess<typeof import("../../src/services/auth/service.js")["auth"]["handler"]>;',
  );
  expect(registry).toContain("    interface ApplicationAccess extends RelkitApplicationAccess {}");
  // The alias is declared before the global block that refers to it.
  expect(registry.indexOf("type RelkitApplicationAccess")).toBeLessThan(
    registry.indexOf("declare global {"),
  );
});

it("declares no access names without a Better Auth service", () => {
  const registry = generateContextRegistry([service("main", "drizzle")] as never, {
    projectRoot: "/app",
  });
  expect(registry).not.toContain("ApplicationAccess");
  expect(registry.startsWith("declare global {")).toBe(true);
});
