/**
 * `relkit deploy init railway` writes `railway.json`, the source Dockerfile, its context allowlist
 * and a GitHub Actions workflow, compared byte for byte with the committed snapshots under
 * `fixtures/deploy-init-railway/<runtime>`. It runs through the real CLI parser and never reaches
 * the deployment service, so no cloud resource can change. Set `RELKIT_UPDATE_SNAPSHOTS=1` to
 * rewrite the snapshots after an intended change.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../src/main.js";
import { railwayFiles } from "../src/commands/deploy-init-railway.js";

const roots: string[] = [];
const snapshots = join(import.meta.dir, "fixtures", "deploy-init-railway");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Runs the CLI in JSON mode inside a fresh project directory.
 * @param args - CLI arguments after `--json`.
 * @param root - Project root.
 * @returns Exit code and the parsed JSON lines.
 */
async function cli(args: readonly string[], root: string) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(["--json", ...args], {
    cwd: root,
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
  });
  return { code, output: [...stdout, ...stderr].join("\n") };
}

/** @returns A temporary project root. */
async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-deploy-init-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), '{ "name": "my-app" }\n');
  return root;
}

for (const runtime of ["bun", "node"] as const) {
  test(`writes the ${runtime} Railway files matching the snapshots`, async () => {
    const root = await project();
    const result = await cli(
      ["deploy", "init", "railway", "--runtime", runtime, "--project-root", root],
      root,
    );
    expect(result.code, result.output).toBe(0);
    for (const file of railwayFiles(runtime)) {
      const written = await readFile(join(root, file.path), "utf8");
      const snapshot = join(snapshots, runtime, file.path);
      if (process.env.RELKIT_UPDATE_SNAPSHOTS === "1") {
        await mkdir(dirname(snapshot), { recursive: true });
        await writeFile(snapshot, written);
      }
      expect(written).toBe(await readFile(snapshot, "utf8"));
    }
    expect(result.output).toContain('"status":"created"');
    expect(result.output).toContain('"cloudResourcesChanged":false');
  });
}

test("keeps identical files, refuses differing ones and replaces them with --force", async () => {
  const root = await project();
  const init = ["deploy", "init", "railway", "--project-root", root];
  expect((await cli(init, root)).code).toBe(0);
  const again = await cli(init, root);
  expect(again.code).toBe(0);
  expect(again.output).not.toContain('"status":"created"');
  expect(again.output).toContain('"status":"unchanged"');

  await writeFile(join(root, "Dockerfile"), "FROM scratch\n");
  const conflict = await cli(init, root);
  expect(conflict.code).not.toBe(0);
  expect(conflict.output).toContain("RELKIT_DEPLOY_INIT_CONFLICT");
  expect(await readFile(join(root, "Dockerfile"), "utf8")).toBe("FROM scratch\n");

  const forced = await cli([...init, "--force"], root);
  expect(forced.code).toBe(0);
  expect(forced.output).toContain('"status":"replaced"');
  expect(await readFile(join(root, "Dockerfile"), "utf8")).toContain("relkit build --runtime bun");
});

test("rejects targets that are not available and platform options on the Pulumi path", async () => {
  const root = await project();
  for (const [args, message] of [
    [["deploy", "init", "vercel"], "not available yet"],
    [["deploy", "init", "heroku"], "Unknown deploy target"],
    [["deploy", "init", "aws", "--runtime", "node"], "--runtime applies to platform targets"],
  ] as const) {
    const result = await cli([...args, "--project-root", root], root);
    expect(result.code, result.output).not.toBe(0);
    expect(result.output).toContain(message);
  }
});
