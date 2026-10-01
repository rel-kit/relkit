import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { typecheckProject } from "../../packages/compiler/src/project-typecheck.js";
import { generateRouteModuleChecks } from "../../packages/compiler/src/route-module-checks.js";

const repository = resolve(import.meta.dir, "../..");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(rootDir = "src", generatedDirectory = ".relkit/generated") {
  await mkdir(join(repository, ".relkit"), { recursive: true });
  const parent = await mkdtemp(join(repository, ".relkit/project-typecheck-"));
  roots.push(parent);
  const root = join(parent, "app");
  await mkdir(join(root, "src/routes"), { recursive: true });
  await mkdir(join(root, generatedDirectory), { recursive: true });
  await symlink(join(repository, "node_modules"), join(root, "node_modules"));
  await writeFile(join(root, "src/example.ts"), "export const example = 1;\n");
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        rootDir,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["bun"],
      },
      include: ["src/**/*.ts"],
      exclude: ["node_modules", ".relkit"],
    }),
  );
  return root;
}

async function writeChecks(root: string, files: readonly string[], generatedDirectory: string) {
  await writeFile(
    join(root, generatedDirectory, "route-module-checks.ts"),
    generateRouteModuleChecks(files, root, generatedDirectory),
  );
}

test("generated checks do not reject rootDir src projects without routes", async () => {
  const root = await fixture();
  const config = await readFile(join(root, "tsconfig.json"), "utf8");
  expect(typecheckProject(root)).toEqual([]);
  await writeChecks(root, ["src/example.ts"], ".relkit/generated");
  expect(typecheckProject(root)).toEqual([]);
  expect(await readFile(join(root, "tsconfig.json"), "utf8")).toBe(config);
});

test("route assertions outside rootDir still reject invalid exports", async () => {
  for (const generatedDirectory of [".relkit/generated", "generated/types"]) {
    const root = await fixture("src", generatedDirectory);
    const route = join(root, "src/routes/route.ts");
    await writeFile(
      route,
      'import { defineRoute } from "@relkit/app/routes";\nexport const GET = defineRoute({ handler: () => new Response("ok") });\n',
    );
    await writeChecks(root, ["src/routes/route.ts"], generatedDirectory);
    expect(typecheckProject(root, generatedDirectory)).toEqual([]);
    await writeFile(route, 'export const GET = "not a route";\n');
    const diagnostics = typecheckProject(root, generatedDirectory);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "TS2344" }));
    expect(diagnostics.some(({ code }) => code === "TS6059")).toBe(false);
  }
}, 15_000);

test("validation retains a broader rootDir and ordinary source type errors", async () => {
  const root = await fixture("..");
  await writeFile(join(root, "../shared.ts"), "export const shared = 1;\n");
  await writeFile(
    join(root, "src/example.ts"),
    'import { shared } from "../../shared.js";\nexport const example: string = shared;\n',
  );
  await writeChecks(root, ["src/example.ts"], ".relkit/generated");
  expect(typecheckProject(root).map(({ code }) => code)).toEqual(["TS2322"]);
});
