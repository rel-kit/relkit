import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { scanScope } from "../scripts/scope-scan";
import { implementationSizeOffenders } from "../scripts/verify";

const root = resolve(import.meta.dir, "..");
const boundaryScript = join(root, "scripts/check-boundaries.ts");

type Files = Record<string, string>;
type CommandResult = { exitCode: number; stdout: string; stderr: string };

async function execute(command: string, args: string[], cwd = root): Promise<CommandResult> {
  const child = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode: await child.exited, stdout, stderr };
}

async function createFixture(files: Files): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), "relkit-phase0-"));
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      workspaces: ["apps/*", "examples/*", "packages/*"],
    }),
  );
  for (const [path, contents] of Object.entries(files)) {
    const file = join(fixture, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return fixture;
}

function manifest(name: string, dependencies: Record<string, string> = {}): string {
  return JSON.stringify({ name, private: true, type: "module", dependencies }, null, 2);
}

function packageFiles(
  packages: Array<{
    path: string;
    name: string;
    source: string;
    dependencies?: Record<string, string>;
  }>,
): Files {
  return Object.fromEntries(
    packages.flatMap(({ path, name, source, dependencies }) => [
      [`${path}/package.json`, manifest(name, dependencies)],
      [`${path}/src/index.ts`, `${source}\nexport {};\n`],
    ]),
  );
}

async function assertBoundaryViolation(
  files: Files,
  expected: { path: string; owner: string; rule: string },
): Promise<void> {
  const fixture = await createFixture(files);
  try {
    const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(expected.path);
    expect(result.stderr).toContain(`[${expected.rule}]`);
    expect(result.stderr).toContain(expected.owner);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

describe.serial("Phase 0 guardrails", () => {
  test("allows a declared public-package dependency", async () => {
    const fixture = await createFixture(
      packageFiles([
        {
          path: "packages/app",
          name: "@relkit/app",
          source: 'import "@relkit/config";',
          dependencies: { "@relkit/config": "workspace:*" },
        },
        { path: "packages/config", name: "@relkit/config", source: "" },
      ]),
    );
    try {
      const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Boundary check passed");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test("allows AI SDK runtime dependencies only in agents", async () => {
    const fixture = await createFixture(
      packageFiles([
        {
          path: "packages/agents",
          name: "@relkit/agents",
          source: 'import "ai"; import "@ai-sdk/openai";',
          dependencies: { ai: "7.0.0", "@ai-sdk/openai": "4.0.0" },
        },
      ]),
    );
    try {
      const result = await execute(process.execPath, ["run", boundaryScript, fixture]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Boundary check passed");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  const boundaryCases: Array<{
    name: string;
    files: Files;
    expected: { path: string; owner: string; rule: string };
  }> = [
    {
      name: "undeclared dependencies",
      files: packageFiles([
        { path: "packages/app", name: "@relkit/app", source: 'import "@relkit/config";' },
        { path: "packages/config", name: "@relkit/config", source: "" },
      ]),
      expected: {
        path: "packages/app/src/index.ts",
        owner: "@relkit/app",
        rule: "undeclared-dependency",
      },
    },
    {
      name: "cross-package relative imports",
      files: packageFiles([
        {
          path: "packages/app",
          name: "@relkit/app",
          source: 'import "../../config/src/index";',
        },
        { path: "packages/config", name: "@relkit/config", source: "" },
      ]),
      expected: {
        path: "packages/app/src/index.ts",
        owner: "@relkit/app",
        rule: "cross-package-relative-import",
      },
    },
    {
      name: "descriptor runtime imports",
      files: packageFiles([
        {
          path: "packages/app",
          name: "@relkit/app",
          source: 'import "@relkit/runtime-effect";',
          dependencies: { "@relkit/runtime-effect": "workspace:*" },
        },
        { path: "packages/runtime-effect", name: "@relkit/runtime-effect", source: "" },
      ]),
      expected: {
        path: "packages/app/src/index.ts",
        owner: "@relkit/app",
        rule: "descriptor-runtime-import",
      },
    },
    ...["hono", "@pulumi/pulumi"].map((dependency) => ({
      name: `graph imports ${dependency}`,
      files: packageFiles([
        {
          path: "packages/graph",
          name: "@relkit/graph",
          source: `import "${dependency}";`,
          dependencies: { [dependency]: "test" },
        },
      ]),
      expected: {
        path: "packages/graph/src/index.ts",
        owner: "@relkit/graph",
        rule: "graph-hono-pulumi-import",
      },
    })),
    ...["@relkit/app", "@relkit/engine"].map((dependency) => ({
      name: `inspector imports ${dependency}`,
      files: packageFiles([
        {
          path: "apps/inspector",
          name: "inspector",
          source: `import "${dependency}";`,
          dependencies: { [dependency]: "workspace:*" },
        },
      ]),
      expected: {
        path: "apps/inspector/src/index.ts",
        owner: "apps/inspector",
        rule: "inspector-runtime-application-import",
      },
    })),
    ...["effect", "hono", "next", "@pulumi/pulumi", "@aws-sdk/client-s3", "@relkit/compiler"].map(
      (dependency) => ({
        name: `fixture imports ${dependency}`,
        files: packageFiles([
          {
            path: "examples/commerce",
            name: "commerce-example",
            source: `import "${dependency}";`,
            dependencies: { [dependency]: "test" },
          },
        ]),
        expected: {
          path: "examples/commerce/src/index.ts",
          owner: "examples/commerce",
          rule: "fixture-template-internal-import",
        },
      }),
    ),
    {
      name: "template imports an internal package",
      files: {
        "templates/default/src/index.ts": 'import "@relkit/compiler";\nexport {};\n',
      },
      expected: {
        path: "templates/default/src/index.ts",
        owner: "templates/default",
        rule: "fixture-template-internal-import",
      },
    },
  ];

  for (const boundaryCase of boundaryCases) {
    test(`rejects ${boundaryCase.name}`, () =>
      assertBoundaryViolation(boundaryCase.files, boundaryCase.expected));
  }

  test("package exports resolve only through the public entry", { timeout: 30_000 }, async () => {
    const result = await execute(process.execPath, ["run", "scripts/pack-and-smoke-exports.ts"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("packed entries resolved; internal paths rejected");
  });

  test("scope exclusions report each affected path and rule", async () => {
    const persistence = ["persis", "tence"].join("");
    const plugin = ["plu", "gin"].join("");
    const subscription = ["define", "Sub", "scription"].join("");
    const forbiddenApi = ["define", "Pers", "istence"].join("");
    const internalPackage = ["@relkit/", persistence].join("");
    const graphKind = [`nodeKind: "`, persistence, `"`].join("");
    const navigation = [`const path = "/`, persistence, `"`].join("");
    const template = [`template: "`, plugin, `"`].join("");
    const alternateIac = ["terra", "form"].join("");
    const fixture = await createFixture({
      "packages/not-approved/src/index.ts": "export {};\n",
      "packages/app/src/subscription-api.ts": `export const value = ${subscription};\n`,
      "examples/commerce/src/events.subscription.ts": "export {};\n",
      "examples/commerce/src/lib.rs": "fn main() {}\n",
      "templates/not-approved/README.md": "# invalid template\n",
      "packages/app/src/persistence-api.ts": `export const value = ${forbiddenApi};\n`,
      "packages/app/src/internal-import.ts": `export const value = "${internalPackage}";\n`,
      "packages/app/src/graph-kind.ts": `export const value = ${graphKind};\n`,
      "packages/app/src/navigation.ts": `export const value = ${navigation};\n`,
      "packages/app/src/template.ts": `export const value = ${template};\n`,
      "packages/app/src/iac.ts": `export const value = ${alternateIac};\n`,
      "examples/commerce/src/persistence.ts": "export {};\n",
    });
    const expected = [
      ["packages/not-approved/src/index.ts", "out-of-scope-package"],
      ["packages/app/src/subscription-api.ts", "subscription-primitive"],
      ["examples/commerce/src/events.subscription.ts", "subscription-source"],
      ["examples/commerce/src/lib.rs", "rust-source"],
      ["templates/not-approved/README.md", "out-of-scope-template-name"],
      ["packages/app/src/persistence-api.ts", "out-of-scope-api"],
      ["packages/app/src/internal-import.ts", "out-of-scope-package"],
      ["packages/app/src/graph-kind.ts", "out-of-scope-graph-name"],
      ["packages/app/src/navigation.ts", "out-of-scope-navigation-name"],
      ["packages/app/src/template.ts", "out-of-scope-template-name"],
      ["packages/app/src/iac.ts", "alternate-iac"],
      ["examples/commerce/src/persistence.ts", "out-of-scope-navigation-name"],
    ];
    try {
      const findings = scanScope(fixture);
      for (const [file, rule] of expected) {
        expect(findings).toContainEqual(expect.objectContaining({ file, rule }));
      }
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test("reports implementation files over the 200-line limit", async () => {
    const fixture = await createFixture({
      "packages/app/src/too-long.ts": Array.from({ length: 201 }, () => "export {};\n").join(""),
    });
    try {
      expect(implementationSizeOffenders(fixture)).toEqual([
        "packages/app/src/too-long.ts (201 lines)",
      ]);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test("repository guidance has current commands and topology", () => {
    const guidance = readFileSync(join(root, "AGENTS.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const gettingStarted = readFileSync(join(root, "docs/getting-started.md"), "utf8");
    for (const stale of [
      "apps/web",
      "packages/ui",
      "@repo/",
      "bun run check-types",
      "There is currently no checked-in test implementation",
      "no Phase 0\n`scripts/*.ts` implementation",
      "Turborepo starter",
      "currently empty",
      "reserved inspector",
    ]) {
      expect(guidance).not.toContain(stale);
      expect(readme).not.toContain(stale);
      expect(gettingStarted).not.toContain(stale);
    }
    for (const current of [
      "apps/docs",
      "apps/inspector",
      "examples/commerce",
      "templates/default",
      "bun run typecheck",
      "tests/phase0.test.ts",
      "bun run verify",
      "PORT=3000",
      "port `3210`",
    ]) {
      expect(guidance).toContain(current);
    }
    expect(guidance).toContain("port `3001`");
    expect(readme).toContain("apps/docs");
    for (const current of ["apps/inspector", "Pulumi", "RELKIT_INSPECTOR_ROOT"]) {
      expect(readme).toContain(current);
      expect(gettingStarted).toContain(current);
    }
    expect(gettingStarted).toContain("--cloud none");
    expect(gettingStarted).toContain("--deploy none");
  });

  test("ignores only RelKit generated and local runtime roots", async () => {
    const ignored = [
      ".relkit/generated/application.graph.json",
      ".relkit/build/server/index.js",
      ".relkit/state/records.ndjson",
      ".relkit/observability/requests.ndjson",
    ];
    const checkedIn = [
      "tests/fixtures/commerce.json",
      "tests/goldens/application.graph.json",
      "templates/default/README.md",
      "openspec/changes/implement-relkit-typescript-poc-v3/PROGRESS.md",
    ];

    for (const path of ignored) {
      expect(
        (await execute("git", ["check-ignore", "--no-index", "--quiet", "--", path])).exitCode,
      ).toBe(0);
    }
    for (const path of checkedIn) {
      expect(
        (await execute("git", ["check-ignore", "--no-index", "--quiet", "--", path])).exitCode,
      ).toBe(1);
    }
  });

  test("rejects lockfile drift in an isolated workspace", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "relkit-lockfile-"));
    const packageJson = {
      name: "lockfile-fixture",
      private: true,
      type: "module",
      dependencies: { "local-dep": "file:./dep" },
    };
    try {
      await mkdir(join(fixture, "dep"), { recursive: true });
      await writeFile(
        join(fixture, "dep/package.json"),
        JSON.stringify({ name: "local-dep", version: "1.0.0" }),
      );
      await writeFile(join(fixture, "package.json"), JSON.stringify(packageJson));
      expect((await execute(process.execPath, ["install"], fixture)).exitCode).toBe(0);
      await mkdir(join(fixture, "other-dep"), { recursive: true });
      await writeFile(
        join(fixture, "other-dep/package.json"),
        JSON.stringify({ name: "other-dep", version: "1.0.0" }),
      );
      await writeFile(
        join(fixture, "package.json"),
        JSON.stringify({
          ...packageJson,
          dependencies: { "local-dep": "file:./other-dep" },
        }),
      );
      const result = await execute(process.execPath, ["install", "--frozen-lockfile"], fixture);
      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/lockfile|frozen/i);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  test("frozen install and typecheck leave lockfile/generated state unchanged", async () => {
    const beforeLockfile = readFileSync(join(root, "bun.lock"), "utf8");
    const beforeGenerated = await execute("git", [
      "diff",
      "--binary",
      "--",
      ".relkit/generated",
      ".relkit/build",
    ]);
    const beforeGeneratedStatus = await execute("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ".relkit/generated",
      ".relkit/build",
    ]);
    expect((await execute(process.execPath, ["install", "--frozen-lockfile"])).exitCode).toBe(0);
    expect((await execute(process.execPath, ["run", "typecheck"])).exitCode).toBe(0);
    expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe(beforeLockfile);
    const afterGenerated = await execute("git", [
      "diff",
      "--binary",
      "--",
      ".relkit/generated",
      ".relkit/build",
    ]);
    const afterGeneratedStatus = await execute("git", [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ".relkit/generated",
      ".relkit/build",
    ]);
    expect(afterGenerated.stdout).toBe(beforeGenerated.stdout);
    expect(afterGeneratedStatus.stdout).toBe(beforeGeneratedStatus.stdout);
  });
});
