import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  CREATE_TEMPLATES,
  formatGenerateResult,
  generateProject,
  isValidPackageName,
  normalizeCreateOptions,
  type CreateOptions,
  type GenerateFailurePoint,
  type GenerateProjectContext,
} from "../../packages/create-relkit/src/index.ts";
import appManifest from "../../packages/app/package.json" with { type: "json" };

const roots: string[] = [];
const templateRoot = resolve(import.meta.dir, "../../templates/default/v1");
const forbiddenImport =
  /(?:from|import)\s*["'](?:effect|hono|next|@pulumi\/[^"']|@aws-sdk\/[^"']|@relkit\/(?:compiler|contracts|deploy|deploy-pulumi|diagnostics|engine|graph|inspector-api|openapi|providers-local|runtime-effect|runtime-hono|supervisor))["']/;
const forbiddenApis = [
  ["define", "Sub", "scription"].join(""),
  ["define", "Per", "sistence"].join(""),
  ["create", "Iden", "tity"].join(""),
  ["define", "Work", "flow"].join(""),
  ["define", "Know", "ledge", "Store"].join(""),
  ["define", "Plu", "gin"].join(""),
  ["create", "Market", "place"].join(""),
];
const forbiddenScopeNames = [
  ["persist", "ence"].join(""),
  ["ident", "ity"].join(""),
  ["work", "flow"].join(""),
  ["know", "ledge", "-store"].join(""),
  ["plug", "in"].join(""),
  ["market", "place"].join(""),
  ["sub", "scription"].join(""),
];
const forbiddenInfrastructureNames = [
  ["terra", "form"].join(""),
  ["open", "tofu"].join(""),
  ["cloud", "formation"].join(""),
  ["c", "dk"].join(""),
  ["s", "st"].join(""),
  ["al", "chemy"].join(""),
  ["server", "less"].join(""),
  ["bi", "cep"].join(""),
];
const forbiddenScope = new RegExp(
  `\\b(?:${forbiddenApis.join("|")})\\b|@relkit/(?:${forbiddenScopeNames.join("|")})\\b|(?:^|[/.])(?:${[
    ...forbiddenScopeNames,
    ...forbiddenInfrastructureNames,
  ].join("|")}|[^/]+\\.rs)(?:[/.]|$)`,
  "i",
);
const legacyApplicationRoot =
  /^src\/(?:env\.ts|(?:functions|events|services|agents|jobs|cache|buckets|tools|middleware|transforms|shared)(?:\/|$))/;

test("covers every template and examples/install/Git combination", async () => {
  const root = await makeRoot();
  for (const template of CREATE_TEMPLATES) {
    for (const examples of [false, true]) {
      for (const install of [false, true]) {
        for (const git of [false, true]) {
          const name = `${template}-${examples ? "examples" : "plain"}-${install ? "install" : "no-install"}-${git ? "git" : "no-git"}`;
          const commands: string[][] = [];
          const result = await generateProject(
            createOptions(name, { template, examples, install, git }),
            contextFor(root, commands),
          );
          const manifest = JSON.parse(await readFile(join(result.destination, "package.json"))) as {
            packageManager: string;
            dependencies: Record<string, string>;
            devDependencies: Record<string, string>;
          };
          const tsconfig = JSON.parse(
            await readFile(join(result.destination, "tsconfig.json"), "utf8"),
          ) as {
            compilerOptions: { baseUrl?: string; paths?: Record<string, string[]> };
          };

          expect(result.template).toBe(template);
          expect(result.installed).toBe(install);
          expect(result.gitInitialized).toBe(git);
          expect(manifest).toMatchObject({ packageManager: "bun@1.3.10" });
          expect(manifest.dependencies).toEqual({
            ...(template === "agent" ? { "@relkit/ai-sdk": appManifest.version } : {}),
            "@relkit/app": appManifest.version,
          });
          expect(manifest.devDependencies).toMatchObject({
            "@types/bun": "1.3.10",
            "@relkit/cli": appManifest.version,
            "@relkit/testing": appManifest.version,
            typescript: "5.9.3",
          });
          expect(tsconfig.compilerOptions).toMatchObject({
            baseUrl: ".",
            paths: { "@app/*": ["src/*"] },
          });
          expect(result.files.some((path) => path.startsWith("src/hello/functions/"))).toBe(true);
          expect(result.files.some((path) => path.startsWith("tests/"))).toBe(examples);
          expect(await scanGeneratedProject(result.destination)).toEqual([]);
          expect(
            commands.filter(([executable, action]) => executable === "bun" && action === "install")
              .length,
          ).toBe(install ? 1 : 0);
          expect(
            commands.filter(([executable, action]) => executable === "git" && action === "init")
              .length,
          ).toBe(git ? 1 : 0);
          expect(commands.slice(-2).map((command) => command.slice(0, 2))).toEqual([
            ["relkit", "doctor"],
            ["relkit", "check"],
          ]);
          expect(commands.at(-2)).toContain("--no-ports");
          expect(commands.at(-2)).toContain("--no-pulumi");
          expect((await readdir(root)).some((entry) => entry.startsWith(`.${name}-relkit-`))).toBe(
            false,
          );
        }
      }
    }
  }
});

test("accepts valid names and rejects invalid names without mutation", async () => {
  const valid = ["my-app", "a.b", "a_b", "a~b", "@scope/package"];
  const invalid: unknown[] = [
    "",
    ".hidden",
    "_hidden",
    "My-App",
    "scope/package",
    "@scope",
    "@/package",
    "node_modules",
    "favicon.ico",
    "x".repeat(215),
    null,
    42,
  ];
  for (const name of valid) expect(isValidPackageName(name)).toBe(true);
  for (const name of invalid) expect(isValidPackageName(name)).toBe(false);

  const root = await makeRoot();
  await expect(
    generateProject(
      createOptions("not a package", { directory: "untouched", install: false, git: false }),
      contextFor(root),
    ),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_NAME_INVALID" });
  expect(await readdir(root)).toEqual([]);
});

test("handles absent, empty, and non-empty destinations atomically", async () => {
  const root = await makeRoot();
  const absent = await generateProject(
    createOptions("absent-app", { directory: "absent-app", install: false, git: false }),
    contextFor(root),
  );
  expect(absent.destination).toBe(join(root, "absent-app"));

  const empty = join(root, "empty-app");
  await mkdir(empty);
  await expect(
    generateProject(createOptions("empty-app", { directory: "empty-app" }), contextFor(root)),
  ).rejects.toMatchObject({ code: "RELKIT_CREATE_DESTINATION_EXISTS" });
  expect(await readdir(empty)).toEqual([]);
  const forced = await generateProject(
    createOptions("empty-app", {
      directory: "empty-app",
      forceEmptyDirectory: true,
      install: false,
      git: false,
    }),
    contextFor(root),
  );
  expect(forced.destination).toBe(empty);

  const nonEmpty = join(root, "non-empty-app");
  await mkdir(nonEmpty);
  await writeFile(join(nonEmpty, "keep.txt"), "keep");
  for (const forceEmptyDirectory of [false, true]) {
    await expect(
      generateProject(
        createOptions("non-empty-app", { directory: "non-empty-app", forceEmptyDirectory }),
        contextFor(root),
      ),
    ).rejects.toMatchObject({ code: "RELKIT_CREATE_DESTINATION_NOT_EMPTY" });
  }
  expect(await readFile(join(nonEmpty, "keep.txt"), "utf8")).toBe("keep");
});

test("normalizes JSON options and keeps generated results JSON-safe", async () => {
  expect(normalizeCreateOptions(["default-app"])).toMatchObject({
    cloud: "none",
    deploy: "none",
  });
  const options = normalizeCreateOptions(
    [
      "@scope/json-app",
      "--template=agent",
      "--cloud",
      "none",
      "--deploy=none",
      "--no-install",
      "--no-git",
      "--no-examples",
      "--directory",
      "projects/json-app",
      "--force-empty-directory",
      "--json",
    ],
    { json: false },
  );
  expect(options).toMatchObject({
    name: "@scope/json-app",
    template: "agent",
    cloud: "none",
    deploy: "none",
    install: false,
    git: false,
    examples: false,
    directory: "projects/json-app",
    forceEmptyDirectory: true,
    json: true,
  });

  const root = await makeRoot();
  const result = await generateProject(options, contextFor(root));
  const json = JSON.parse(JSON.stringify(result)) as typeof result;
  expect(json).toMatchObject({
    ok: true,
    name: "@scope/json-app",
    installed: false,
    gitInitialized: false,
  });
  expect(json.nextSteps.endpoints).not.toHaveProperty("route");
  expect(json.nextSteps.endpoints).toMatchObject({
    openapi: "http://localhost:3000/_relkit/v1/openapi.json",
    apiReference: "http://localhost:3000/_relkit/v1/api-reference",
  });
  expect(formatGenerateResult(json)).toContain("api docs:");
  expect(formatGenerateResult(json)).toContain(
    `Success! Created @scope/json-app at ${result.destination}.`,
  );
  expect(formatGenerateResult(json)).not.toContain("route:");
});

test("adds AWS and Pulumi only when explicitly selected", async () => {
  const root = await makeRoot();
  const result = await generateProject(
    createOptions("deployed-app", {
      cloud: "aws",
      deploy: "pulumi",
      install: false,
      git: false,
    }),
    contextFor(root),
  );
  const manifest = JSON.parse(await readFile(join(result.destination, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  const config = await readFile(join(result.destination, "relkit.config.ts"), "utf8");
  expect(manifest.dependencies).toMatchObject({
    "@relkit/app": appManifest.version,
    "@relkit/aws": appManifest.version,
    "@relkit/pulumi": appManifest.version,
  });
  expect(manifest.scripts).toMatchObject({
    "deploy:preview": "relkit deploy preview",
    deploy: "relkit deploy up",
  });
  expect(config).toContain('import "@relkit/aws";');
  expect(config).toContain('import "@relkit/pulumi";');
  expect(config).toContain('deployment: { engine: "pulumi", host: "aws" }');
});

test("reports only the create milestones that run", async () => {
  const root = await makeRoot();
  const full: string[] = [];
  await generateProject(createOptions("full-progress"), {
    ...contextFor(root),
    onProgress: (message) => full.push(message),
  });
  expect(full).toEqual([
    `Creating a new RELKIT app in ${join(root, "full-progress")}.`,
    "Installing dependencies...",
    "Initializing Git repository...",
    "Checking generated project...",
  ]);

  const minimal: string[] = [];
  await generateProject(createOptions("minimal-progress", { install: false, git: false }), {
    ...contextFor(root),
    onProgress: (message) => minimal.push(message),
  });
  expect(minimal).toEqual([
    `Creating a new RELKIT app in ${join(root, "minimal-progress")}.`,
    "Checking generated project...",
  ]);
});

test("produces byte-identical content from separate destinations", async () => {
  const root = await makeRoot();
  const options = createOptions("deterministic-app", { install: false, git: false });
  const first = await generateProject(options, contextFor(root));
  const second = await generateProject({ ...options, directory: "second" }, contextFor(root));
  expect(await snapshotProject(first.destination)).toEqual(
    await snapshotProject(second.destination),
  );
});

test("rolls back every pre-rename failure and removes its temporary sibling", async () => {
  const failurePoints: readonly GenerateFailurePoint[] = [
    "copy",
    "substitute",
    "install",
    "git",
    "doctor",
    "check",
    "rename",
  ];
  const root = await makeRoot();
  for (const point of failurePoints) {
    const name = `rollback-${point}`;
    const options = createOptions(name, { install: point === "install", git: point !== "install" });
    await expect(
      generateProject(options, {
        ...contextFor(root),
        failAt: (actual) => {
          if (actual === point) throw new Error(`injected ${point}`);
        },
      }),
    ).rejects.toMatchObject({ code: `RELKIT_CREATE_${point.toUpperCase()}_FAILED` });
    expect(await readdir(root)).not.toContain(name);
    expect((await readdir(root)).some((entry) => entry.startsWith(`.${name}-relkit-`))).toBe(false);
  }
});

function createOptions(
  name: string,
  overrides: Partial<Omit<CreateOptions, "name">> = {},
): CreateOptions {
  return {
    name,
    template: "minimal",
    cloud: "none",
    deploy: "none",
    install: true,
    git: true,
    examples: true,
    forceEmptyDirectory: false,
    json: false,
    ...overrides,
  };
}

function contextFor(root: string, commands: string[][] = []): GenerateProjectContext {
  return {
    cwd: root,
    templateRoot,
    bunExecutable: "bun",
    gitExecutable: "git",
    relkitExecutable: "relkit",
    commandRunner: async (command) => {
      commands.push([...command]);
      return { exitCode: 0 };
    },
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-generator-matrix-"));
  roots.push(root);
  return root;
}

async function snapshotProject(
  root: string,
): Promise<Record<string, { mode: number; content: string }>> {
  const result: Record<string, { mode: number; content: string }> = {};
  for (const path of await projectFiles(root)) {
    const info = await stat(join(root, path));
    result[path] = { mode: info.mode & 0o777, content: await readFile(join(root, path), "base64") };
  }
  return result;
}

async function projectFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await projectFiles(root, path)));
    else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
  }
  return files;
}

async function scanGeneratedProject(root: string): Promise<string[]> {
  const violations: string[] = [];
  const sourceRoot = join(root, "src");
  for (const path of await projectFiles(root)) {
    if (legacyApplicationRoot.test(path)) violations.push(`${path}:legacy-application-root`);
    if (forbiddenScope.test(path)) violations.push(`${path}:out-of-scope`);
    if (!/\.(?:ts|tsx|js|json|md|toml|yaml|yml)$/.test(path)) continue;
    const text = await readFile(join(root, path), "utf8");
    if (forbiddenImport.test(text)) violations.push(`${path}:forbidden-import`);
    if (forbiddenScope.test(text)) violations.push(`${path}:out-of-scope`);
    for (const match of text.matchAll(/(?:from\s+|import\s*\()\s*["'](\.\.?\/[^"']+)["']/g)) {
      const target = resolve(dirname(join(root, path)), match[1]!);
      const sourcePath = relative(sourceRoot, target);
      if (!sourcePath.startsWith("..") && !isAbsolute(sourcePath)) {
        violations.push(`${path}:relative-app-import`);
      }
    }
  }
  return violations.sort();
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
