import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import ts from "typescript";
import {
  generateRouteModuleChecks,
  ROUTE_MODULE_CHECK_REFERENCES,
} from "../../packages/cli/src/compiler/route-module-checks.js";
import { routeModuleFindings } from "../../packages/cli/src/compiler/route-module-diagnostics.js";
import { routeSourceFindings } from "../../packages/cli/src/compiler/route-source-checks.js";
import { readFacts } from "../../packages/cli/src/compiler/discovery/source-facts.js";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];
const prefix = `import service from "../../users/service.js";
import { defineRoute, defineServiceRoutes } from "relkit/routes";
`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(route: string) {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const root = await mkdtemp(join(repository, ".relkit/route-module-test-"));
  roots.push(root);
  await mkdir(join(root, "src/routes/users"), { recursive: true });
  await mkdir(join(root, "src/users"), { recursive: true });
  await mkdir(join(root, ".relkit/generated"), { recursive: true });
  await mkdir(join(root, "node_modules/@relkit"), { recursive: true });
  await symlink(join(repository, "packages/app"), join(root, "node_modules/@relkit/app"));
  await writeFile(
    join(root, "src/users/service.ts"),
    `
import { defineFunction } from "relkit/functions";
import { defineService } from "relkit/services";
import { z } from "relkit/schema";
const example = defineFunction({ id: "users.example", input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }), handler: async ({ id }) => ({ id }) });
export default defineService({ functions: { example } });
`,
  );
  await writeFile(join(root, "src/routes/users/route.ts"), route);
  await writeFile(
    join(root, ".relkit/generated/route-module-checks.ts"),
    generateRouteModuleChecks(["src/routes/users/route.ts"], root),
  );
  for (const file of ROUTE_MODULE_CHECK_REFERENCES)
    await writeFile(join(root, ".relkit/generated", file), "export {};\n");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["bun"],
      },
      files: [".relkit/generated/route-module-checks.ts"],
      include: ["src/**/*.ts"],
      exclude: ["node_modules", ".relkit"],
    }),
  );
  return root;
}

function program(root: string) {
  const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  return ts.createProgram(parsed.fileNames, parsed.options);
}

test("installed public declarations validate individual routes and service-route destructuring", async () => {
  for (const route of [
    `${prefix}export const GET = defineRoute({ target: service.example });`,
    `${prefix}export const { GET, POST } = defineServiceRoutes(service, { GET: "example", POST: "example" });`,
    `${prefix}export const GET = defineRoute({ handler: () => new Response("ok") });`,
    `${prefix}export const GET = defineRoute({ target: service.example });
export type { defineServiceRoutes as RouteFactory } from "relkit/routes";`,
  ]) {
    const root = await fixture(route);
    const application = program(root);
    expect(
      ts
        .getPreEmitDiagnostics(application)
        .map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")),
    ).toEqual([]);
    expect(
      routeModuleFindings(
        application,
        application.getSourceFile(join(root, "src/routes/users/route.ts"))!,
      ),
    ).toEqual([]);
  }
}, 60_000);

test("tsc rejects bad route exports even with skipLibCheck and generated files excluded", async () => {
  for (const route of [
    `${prefix}export const GET = defineServiceRoutes(service, { GET: "example" });`,
    `${prefix}export const GET: any = defineRoute({ target: service.example });`,
    `${prefix}export const TRACE = defineRoute({ target: service.example });`,
    `${prefix}export default defineRoute({ target: service.example });`,
    `${prefix}export const ALL = defineRoute({ target: service.example });`,
    `${prefix}export const GET = { kind: "route" as const, target: service.example };`,
    "export {};",
  ]) {
    const root = await fixture(route);
    const application = program(root);
    const errors = ts.getPreEmitDiagnostics(application);
    expect(
      errors.some(
        (entry) => entry.file?.fileName.endsWith("route-module-checks.ts") && entry.code === 2344,
      ),
    ).toBe(true);
    expect(
      routeModuleFindings(
        application,
        application.getSourceFile(join(root, "src/routes/users/route.ts"))!,
      ).length,
    ).toBeGreaterThan(0);
  }
}, 60_000);

test("module checking follows reexports instead of relying on initializer syntax", async () => {
  const root = await fixture('export { default as GET } from "../../users/routes.js";');
  await writeFile(
    join(root, "src/users/routes.ts"),
    `import service from "./service.js";
import { defineServiceRoutes } from "relkit/routes";
export default defineServiceRoutes(service, { GET: "example" });`,
  );
  const application = program(root);
  expect(ts.getPreEmitDiagnostics(application).some((entry) => entry.code === 2344)).toBe(true);
  expect(
    routeModuleFindings(
      application,
      application.getSourceFile(join(root, "src/routes/users/route.ts"))!,
    ),
  ).toHaveLength(1);
});

test("module findings locate invalid star reexports in the route module", async () => {
  const root = await fixture('export * from "../../users/routes.js";');
  await writeFile(
    join(root, "src/users/routes.ts"),
    `${"// external source padding\n".repeat(20)}${prefix.replace("../../users/service.js", "./service.js")}
export const GET = defineServiceRoutes(service, { GET: "example" });`,
  );
  const application = program(root);
  const source = application.getSourceFile(join(root, "src/routes/users/route.ts"))!;
  const findings = routeModuleFindings(application, source);
  expect(findings).toHaveLength(1);
  expect(findings[0]?.node.getSourceFile()).toBe(source);
  expect(source.getLineAndCharacterOfPosition(findings[0]!.node.getStart(source))).toEqual({
    line: 0,
    character: 0,
  });
});

test("source rules recognize import aliases, namespaces and wrapped expressions", () => {
  for (const [imported, callee] of [
    ['import { defineServiceRoutes as routes } from "relkit/routes";', "routes"],
    ['import { defineServiceRoutes as routes } from "relkit";', "routes"],
    ['import * as routes from "relkit/routes";', "routes.defineServiceRoutes"],
  ]) {
    const text = `${imported}\n\nexport const GET = (${callee}(service, { GET: "example" }));`;
    const source = ts.createSourceFile(
      "src/routes/users/route.ts",
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const findings = routeSourceFindings(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("export default defineServiceRoutes(...)");
    expect(source.getLineAndCharacterOfPosition(findings[0]!.node.getStart(source))).toEqual({
      line: 2,
      character: 13,
    });
  }
  const local = ts.createSourceFile(
    "src/routes/users/route.ts",
    "function defineServiceRoutes() {}\nexport const GET = defineServiceRoutes();",
    ts.ScriptTarget.Latest,
    true,
  );
  expect(routeSourceFindings(local)).toEqual([]);
  const map = ts.createSourceFile(
    "src/routes/users/route.ts",
    'import { defineServiceRoutes } from "relkit/routes";\nexport default defineServiceRoutes(service, { GET: "example" });',
    ts.ScriptTarget.Latest,
    true,
  );
  expect(routeSourceFindings(map)).toEqual([]);
});

test("route validators sort, deduplicate and support custom output directories", () => {
  const source = generateRouteModuleChecks(
    [
      "src/routes/z/route.ts",
      "src/users/service.ts",
      "src/routes/route.ts",
      "src/routes/z/route.ts",
    ],
    "/app",
    "generated/types",
  );
  expect(source).toContain('typeof import("../../src/routes/route.js")');
  expect(source.match(/export type CheckRoute/g)).toHaveLength(2);
  expect(source.indexOf("// src/routes/route.ts")).toBeLessThan(
    source.indexOf("// src/routes/z/route.ts"),
  );
});

test("service route destructuring rejects renamed methods, rest bindings and ALL", () => {
  for (const binding of ["{ GET: POST }", "{ ...GET }", "{ ALL }", "{ TRACE }"]) {
    const source = ts.createSourceFile(
      "src/routes/users/route.ts",
      `${prefix}export const ${binding} = defineServiceRoutes(service, { GET: "example" });`,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(routeSourceFindings(source)).toHaveLength(1);
  }
});

test("aliased service-route factories retain static route identity evidence", () => {
  const source = ts.createSourceFile(
    "src/routes/users/route.ts",
    `
import { defineServiceRoutes as expose } from "relkit/routes";
export const { GET } = expose(service, { GET: "example" });`,
    ts.ScriptTarget.Latest,
    true,
  );
  const facts = readFacts(source);
  expect(facts.exports.get("GET")?.factory?.factory).toBe("defineServiceRoutes");
  expect(facts.routeOperations).toContainEqual(
    expect.objectContaining({ exportName: "GET", method: "GET" }),
  );
});

test("plain tsc without the editor plugin rejects every route module the plugin rejects", async () => {
  const both = 'defineServiceRoutes(service, { GET: "example", POST: "example" })';
  for (const route of [
    `${prefix}export const { GET: POST } = defineServiceRoutes(service, { GET: "example" });`,
    `${prefix}export const { GET: POST, POST: GET } = ${both};`,
    `${prefix}export const { GET, ...rest } = ${both};`,
    `${prefix}const { GET } = ${both};\nexport {};`,
    `${prefix}export const routes = ${both};`,
  ]) {
    const root = await fixture(route);
    const application = program(root);
    const source = application.getSourceFile(join(root, "src/routes/users/route.ts"))!;
    const plugin = [...routeSourceFindings(source), ...routeModuleFindings(application, source)];
    expect(plugin.length).toBeGreaterThan(0);
    // The fixture's tsconfig lists only route-module-checks.ts and has no plugin.
    expect(ts.getPreEmitDiagnostics(application).length).toBeGreaterThan(0);
  }
}, 60_000);

test("route checks bring the context and event registries into the program", async () => {
  const root = await fixture(
    `${prefix}export const GET = defineRoute({ target: service.example });`,
  );
  const application = program(root);
  for (const file of ROUTE_MODULE_CHECK_REFERENCES)
    expect(application.getSourceFile(join(root, ".relkit/generated", file))).toBeDefined();
  expect(ts.getPreEmitDiagnostics(application)).toEqual([]);
});
