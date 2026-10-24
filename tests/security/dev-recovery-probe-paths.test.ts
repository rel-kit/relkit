/** Verifies native recovery-probe containment and separates emitted evidence markers from Bun source frames. */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const repository = resolve(import.meta.dirname, "../..");
const probe = join(repository, "packages/cli/tests/dev-environment/recovery.probe.ts");

test("recovery probe accepts lexical and canonical temporary app paths", async () => {
  const app = await mkdtemp(join(tmpdir(), "relkit-recovery-path-test-"));
  const manifest = JSON.stringify({ scripts: {} });
  await mkdir(join(app, "src/platform"), { recursive: true });
  await mkdir(join(app, "src/services/hello/functions"), { recursive: true });
  await writeFile(join(app, "package.json"), manifest);
  try {
    for (const input of new Set([app, await realpath(app)])) {
      const child = Bun.spawn([process.execPath, probe, input, "--source-only"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      // The deliberately incomplete fixture stops before it can launch a server.
      expect(code).not.toBe(0);
      expect(stderr).toContain("Missing fixture route");
      const evidence = stdout.match(/^Evidence directory: (.+)$/m)?.[1];
      expect(evidence).toBeDefined();
      if (evidence !== undefined) {
        expect((await realpath(evidence)).startsWith((await realpath(tmpdir())) + "/")).toBe(true);
        expect(evidence).toContain("/relkit-dev-recovery-evidence-");
        await rm(evidence, { recursive: true });
      }
      expect(await readFile(join(app, "package.json"), "utf8")).toBe(manifest);
      expect(existsSync(join(app, "src/platform/env.ts"))).toBe(false);
    }
  } finally {
    await rm(app, { recursive: true, force: true });
  }
});

test("recovery probe rejects caller-selected evidence directories before writing", async () => {
  const app = await mkdtemp(join(tmpdir(), "relkit-recovery-path-test-"));
  const evidence = join(app, "unowned-evidence");
  await writeFile(join(app, "package.json"), JSON.stringify({ scripts: {} }));
  try {
    const child = Bun.spawn([process.execPath, probe, app, evidence], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).not.toBe(0);
    expect(existsSync(evidence)).toBe(false);
    expect(stdout + stderr).toContain("Probe owns its evidence directory");
  } finally {
    await rm(app, { recursive: true, force: true });
  }
});

test("archived probe only uses literal phases in log filenames", async () => {
  const source = await readFile(
    resolve(
      repository,
      "bug-fix-reports/issues/bf-6c1f59bebfd1c8865038fc52/evidence/001/runtime.probe.ts",
    ),
    "utf8",
  );
  const file = ts.createSourceFile("probe.ts", source, ts.ScriptTarget.Latest, true);
  const declarations = file.statements.filter(
    (statement) =>
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "phase",
      ),
  );
  const javascript = ts.transpileModule(declarations.map((node) => node.getText(file)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext },
  }).outputText;
  const phase = new Function("process", javascript + "\nreturn phase;");
  for (const value of [undefined, "before", "after", "smoke"])
    expect(phase({ argv: ["bun", "probe", value] })).toBe(value ?? "before");
  for (const value of ["../../escape", "before/../../escape", "/tmp/escape", "after\\escape", ""])
    expect(() => phase({ argv: ["bun", "probe", value] })).toThrow("Invalid probe phase");
});

test("recovery probe rejects external, sibling-prefix and escaping symlink apps", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "relkit-recovery-path-test-"));
  const link = join(temporary, "outside");
  await symlink("/", link);
  const output = join(temporary, "probe-output.log");
  await writeFile(output, "");
  const before = (await readdir(temporary)).sort();
  let successful = false;
  try {
    for (const app of ["/", tmpdir() + "-sibling/app", link, temporary, tmpdir()]) {
      const child = Bun.spawn([process.execPath, probe, app], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, TMPDIR: temporary },
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      await writeFile(output, stdout + stderr);
      expect(code).not.toBe(0);
      expect(stdout + stderr).toContain("Probe requires a disposable temporary app");
      expect((await readdir(temporary)).sort()).toEqual(before);
      expect(stdout + stderr).not.toMatch(/^Evidence directory:/m);
    }
    successful = true;
  } finally {
    if (successful) await rm(temporary, { recursive: true, force: true });
    else console.error(`Failed recovery path fixture retained: ${temporary}`);
  }
});
