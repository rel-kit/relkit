/** Real server-backed auth through a generated app; dependencies are explicitly workspace linked. */
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { live, repository, requireHeadroom } from "./packed-support.ts";
import { authHttp } from "./packed-auth.ts";

const [dialect, url] = process.argv.slice(2);
assert.ok(dialect === "mysql" || dialect === "postgresql");
assert.ok(url);
const temporary = await mkdtemp(join(tmpdir(), "relkit-dialect-auth-"));
const root = join(temporary, "app");
const owner = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
const port = owner.port!;
await owner.stop(true);
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_URL = `http://127.0.0.1:${port}`;
process.env.BETTER_AUTH_SECRET = "isolated-dialect-secret-for-local-acceptance-only-123456";
process.env.NODE_OPTIONS = "--max-old-space-size=512";
const steps: unknown[] = [];
async function run(label: string, command: string[], cwd = root) {
  await requireHeadroom(label === "typecheck" ? 512 : 192);
  const child = Bun.spawn(command, { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  steps.push({ label, exit });
  await writeFile(join(import.meta.dir, `${dialect}-auth-${label}.log`), stdout + stderr);
  assert.equal(exit, 0, `${label}: ${stdout}${stderr}`);
}
try {
  const cli = join(repository, "packages/cli/dist/bin.js");
  await run("create", [process.execPath, "--smol", cli, "create", "acceptance-app", "--directory", root, "--template", "minimal", "--cloud", "none", "--deploy", "none", "--examples", "--no-install", "--no-git", "--json"], repository);
  await run("add", [process.execPath, "--smol", cli, "add", "auth", "--database-dialect", dialect, "--no-install", "--json"]);
  await run("link", ["python3", "-c", 'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from local_support import link; link(Path(sys.argv[2]))', import.meta.dir, root], repository);
  for (const path of ["src/services/account/service.ts", "src/services/account/functions/session.function.ts", "src/routes/account/profile/route.ts", "src/routes/api/auth/[[...auth]]/route.ts"]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repository, "examples/auth-drizzle", path), join(root, path));
  }
  await run("generate", [process.execPath, "--smol", join(root, "node_modules/drizzle-kit/bin.cjs"), "generate", "--name=auth"]);
  await run("migrate", [process.execPath, "--smol", cli, "db", "migrate", "--json"]);
  await run("repeat", [process.execPath, "--smol", cli, "db", "migrate", "--json"]);
  await run("check", [process.execPath, "--smol", cli, "check"]);
  await run("typecheck", ["node", "--max-old-space-size=512", join(root, "node_modules/typescript/bin/tsc"), "--noEmit"]);
  await run("build", [process.execPath, "--smol", cli, "build"]);
  let http;
  await live(root, async (base) => { http = await authHttp(base); }, port);
  console.log("DIALECT_AUTH_RESULT=" + JSON.stringify({ passed: true, dialect, steps, http, workspaceLinked: true }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
