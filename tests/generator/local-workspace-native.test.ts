/** Verifies explicit native-owner sharing, project-local frontend packages and independently versioned CLI output. */
import { afterEach, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useWorkspaceDependencies } from "../../packages/cli/src/local.js";
import appManifest from "../../packages/app/package.json" with { type: "json" };
import cliManifest from "../../packages/cli/package.json" with { type: "json" };
import langchainManifest from "../../integrations/packages/langchain/package.json" with { type: "json" };

const roots: string[] = [];
const successful = new Set<string>();

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed local workspace fixture retained: ${root}`);
  }
});

test("local create shares matching native dependencies without changing different versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-native-links-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        "@relkit/app": appManifest.version,
        "@relkit/langchain": langchainManifest.version,
        "@langchain/langgraph": "1.4.14",
        langchain: "1.5.10",
        effect: "4.0.0-rc.114",
      },
    }),
  );

  const names = await useWorkspaceDependencies(root);
  expect(names).toContain("@langchain/langgraph");
  expect(names).toContain("langchain");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(manifest.dependencies).toEqual({
    "@relkit/app": "link:@relkit/app",
    "@relkit/langchain": "link:@relkit/langchain",
    "@langchain/langgraph": "link:@langchain/langgraph",
    langchain: "link:langchain",
    effect: "4.0.0-rc.114",
  });
  expect(await useWorkspaceDependencies(root)).toEqual(names);
  successful.add(root);
});

test("local links keep web dependencies local and repair previously linked inspector packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-web-dependencies-"));
  roots.push(root);
  for (const linked of [false, true]) {
    if (linked) {
      await mkdir(join(root, "node_modules"), { recursive: true });
      await symlink(
        join(import.meta.dir, "../../packages/cli/node_modules/next"),
        join(root, "node_modules/next"),
      );
    }
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          "@relkit/app": appManifest.version,
          langchain: "link:langchain",
          next: linked ? "link:next" : "16.3.3",
          react: linked ? "link:react" : "19.2.8",
          "react-dom": linked ? "link:react-dom" : "19.2.8",
        },
        devDependencies: { "@relkit/cli": cliManifest.version },
      }),
    );
    const names = await useWorkspaceDependencies(root);
    const manifest = await Bun.file(join(root, "package.json")).json();
    expect(names).not.toContain("next");
    expect(names).not.toContain("react");
    expect(names).not.toContain("react-dom");
    expect(names).not.toContain("langchain");
    expect(manifest.dependencies).toMatchObject({
      langchain: cliManifest.relkit.buildCatalog.dependencies.langchain,
      next: linked ? cliManifest.relkit.buildCatalog.dependencies.next : "16.3.3",
      react: "19.2.8",
      "react-dom": "19.2.8",
    });
    if (linked) {
      await expect(lstat(join(root, "node_modules/next"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(
        await Bun.file(
          join(import.meta.dir, "../../packages/cli/node_modules/next/package.json"),
        ).exists(),
      ).toBe(true);
    }
  }
  successful.add(root);
});

test("local launcher and linked CLI hide workspace build output", async () => {
  const repository = join(import.meta.dir, "../..");
  const external = await mkdtemp(join(tmpdir(), "relkit-linked-cli-"));
  roots.push(external);
  for (const [executable, cwd] of [
    [join(repository, "scripts/relkit-local.ts"), repository],
    [join(repository, "packages/cli/dist/bin.js"), external],
  ]) {
    const child = Bun.spawn([process.execPath, executable, "--version"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`relkit ${cliManifest.version}`);
    expect(`${stdout}\n${stderr}`).not.toContain("turbo");
    expect(`${stdout}\n${stderr}`).not.toContain("Workspace build passed");
  }
  successful.add(external);
}, 20_000);
