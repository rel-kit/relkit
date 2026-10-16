import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const repository = resolve(import.meta.dirname, "../..");
const probe = join(repository, "packages/cli/tests/dev-environment/recovery.probe.ts");

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
  try {
    for (const app of ["/", tmpdir() + "-sibling/app", link, tmpdir()]) {
      const child = Bun.spawn([process.execPath, probe, app], { stdout: "pipe", stderr: "pipe" });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).not.toBe(0);
      expect(stdout + stderr).toContain("Probe requires a disposable temporary app");
      expect(stdout + stderr).not.toContain("Evidence directory:");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
