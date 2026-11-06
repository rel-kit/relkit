/** Checks that an application may define several Drizzle services with one default. */
import { expect, it } from "vitest";
import { generateContextRegistry } from "../../src/compiler/context-registry.js";
import { normalizeCompilation } from "../../src/compiler/normalize.js";

const drizzle = (id: string, isDefault?: true) => ({
  kind: "service",
  id,
  ref: { kind: "service", id },
  capability: {
    kind: "drizzle",
    dialect: "sqlite",
    tables: [],
    ...(isDefault === undefined ? {} : { default: isDefault }),
  },
});

function diagnostics(descriptors: readonly unknown[]): readonly string[] {
  return normalizeCompilation({ descriptors, appId: "app", sources: [] }).diagnostics.map(
    (entry) => entry.message,
  );
}

it("accepts several Drizzle services when exactly one is the default", () => {
  expect(diagnostics([drizzle("main", true), drizzle("analytics")])).toEqual([]);
  expect(diagnostics([drizzle("main")])).toEqual([]);
});

it("rejects several Drizzle services without exactly one default", () => {
  const message =
    "Several Drizzle services need exactly one with default: true; it becomes ctx.database and the Better Auth database.";
  expect(diagnostics([drizzle("main"), drizzle("analytics")])).toEqual([message]);
  expect(diagnostics([drizzle("main", true), drizzle("analytics", true)])).toEqual([message]);
});

it("types ctx.database as the default service", () => {
  const extracted = (exportName: string, isDefault?: true) => ({
    exportName,
    reference: { module: `src/services/${exportName}/service.ts` },
    descriptor: { kind: "service", id: exportName, metadata: drizzle(exportName, isDefault) },
  });
  const registry = generateContextRegistry(
    [extracted("analytics"), extracted("main", true)] as never,
    { projectRoot: "/app" },
  );
  expect(registry).toContain(
    'readonly database: import("@relkit/drizzle").DatabaseContext<typeof import("../../src/services/main/service.js")["main"]>;',
  );
});
