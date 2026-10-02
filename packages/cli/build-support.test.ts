import { expect, test } from "bun:test";
import { cp, lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

for (const development of [true, false]) {
  test(`bundles without optional DeepAgents in ${development ? "development" : "production"}`, async () => {
    const fixture = await createFixture();
    try {
      const built = await fixture.build(development);
      expect(built.code, built.output).toBe(0);
      await expect(lstat(join(fixture.server, "node_modules"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      const started = await run([join(fixture.server, "index.js")], fixture.root);
      expect(started).toEqual({ code: 0, output: "ready\n" });
      const missing = await run([join(fixture.server, "index.js"), "invoke"], fixture.root);
      expect(missing).toEqual({ code: 0, output: "optional dependency unavailable\n" });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
}

for (const nested of [false, true]) {
  test(`bundles ${nested ? "nested" : "hoisted"} DeepAgents into a standalone production server`, async () => {
    const fixture = await createFixture();
    try {
      const dependency = nested
        ? join(fixture.modules, "@relkit/agents/node_modules/deepagents")
        : join(fixture.modules, "deepagents");
      await mkdir(dependency, { recursive: true });
      await writeFile(
        join(dependency, "package.json"),
        JSON.stringify({ name: "deepagents", type: "module", exports: "./index.js" }),
      );
      await writeFile(join(dependency, "index.js"), 'export const value = "native agent ready";');
      const built = await fixture.build(false);
      expect(built.code, built.output).toBe(0);
      await rm(fixture.modules, { recursive: true, force: true });
      const started = await run([join(fixture.server, "index.js"), "invoke"], fixture.root);
      expect(started).toEqual({ code: 0, output: "native agent ready\n" });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
}

test("missing required imports still fail bundling and remove the temporary module link", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(join(fixture.server, "index.ts"), 'import "missing-required-package";');
    const built = await fixture.build(false);
    expect(built.code).not.toBe(0);
    expect(built.output).toContain('Could not resolve: "missing-required-package"');
    await expect(lstat(join(fixture.server, "node_modules"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

async function createFixture() {
  // Relocate the CLI helper so workspace devDependencies cannot mask missing peers.
  const root = await mkdtemp(join(tmpdir(), "relkit-build-optional-peer-"));
  const helper = join(root, "cli/src/commands/build-support.ts");
  const modules = join(root, "cli/node_modules");
  const server = join(root, "server");
  await mkdir(dirname(helper), { recursive: true });
  await mkdir(join(modules, "@relkit/agents"), { recursive: true });
  await mkdir(server);
  await cp(join(import.meta.dir, "src/commands/build-support.ts"), helper);
  await writeFile(
    join(modules, "@relkit/agents/package.json"),
    JSON.stringify({ name: "@relkit/agents", type: "module", exports: "./index.js" }),
  );
  await writeFile(
    join(modules, "@relkit/agents/index.js"),
    'export const load = () => import("deepagents");',
  );
  await writeFile(
    join(server, "index.ts"),
    `import { load } from "@relkit/agents";
if (process.argv[2] === "invoke") {
  try { console.log((await load()).value); }
  catch { console.log("optional dependency unavailable"); }
} else console.log("ready");
`,
  );
  return {
    root,
    modules,
    server,
    build: (development: boolean) =>
      run(
        [
          "-e",
          `import { bundleServer } from ${JSON.stringify(helper)};
await bundleServer(${JSON.stringify(server)}, ${JSON.stringify(root)}, ${development});`,
        ],
        root,
      ),
  };
}

async function run(args: string[], cwd: string) {
  const child = Bun.spawn([process.execPath, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, output: `${stdout}${stderr}` };
}
