/**
 * Tests the `relkit migrate` transaction through the CLI: a preview lists changed files and the
 * code it cannot change with file and line and writes nothing; `--write` applies the edits,
 * creates new files and leaves a migration record; `--rollback` restores every original byte
 * and deletes created files; and rollback refuses to overwrite a file edited afterwards.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../../../src/main.js";

const project = {
  "package.json": '{\n  "name": "app",\n  "dependencies": {\n    "@relkit/app": "0.8.4"\n  }\n}\n',
  "src/services/auth/service.ts":
    'import { defineBetterAuthService } from "@relkit/better-auth";\n\nexport default defineBetterAuthService({\n  emailAndPassword: { enabled: true },\n});\n',
  "src/services/jobs/send.job.ts":
    'import { defineJob } from "@relkit/app/jobs/legacy";\n\nexport default defineJob({ id: "send", target: send });\n',
};
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * Writes the test project into a fresh temporary folder.
 * @returns The project root.
 */
async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-migrate-"));
  roots.push(root);
  for (const [path, text] of Object.entries(project)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

/**
 * Runs `relkit --json migrate` and parses its single result line.
 * @param args - Arguments after `migrate`.
 * @returns Exit status and the parsed result.
 */
async function migrate(...args: string[]) {
  const stdout: string[] = [];
  const status = await runCli(["--json", "migrate", ...args], {
    installSignalHandlers: false,
    io: { stdout: (line) => stdout.push(line), stderr: () => undefined },
  });
  return { status, result: JSON.parse(stdout.join("")) };
}

describe("relkit migrate transaction", () => {
  test("previews without writing and lists findings with file and line", async () => {
    const root = await createProject();
    const { status, result } = await migrate("--project-root", root);
    expect(status).toBe(0);
    expect(result.status).toBe("preview");
    expect(result.changes).toEqual([
      { path: "package.json", created: false, rules: ["package-imports"] },
      { path: "src/services/auth/better-auth.ts", created: true, rules: ["better-auth-file"] },
      { path: "src/services/auth/service.ts", created: false, rules: ["better-auth-file"] },
    ]);
    expect(
      result.findings.map((finding: { file: string; line: number; rule: string }) => [
        finding.file,
        finding.line,
        finding.rule,
      ]),
    ).toEqual([
      ["src/services/auth/service.ts", 3, "better-auth-file"],
      ["src/services/jobs/send.job.ts", 1, "package-imports"],
      ["src/services/jobs/send.job.ts", 3, "legacy-jobs"],
    ]);
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(project["package.json"]);
    await expect(access(join(root, "src/services/auth/better-auth.ts"))).rejects.toThrow();
  });

  test("writes with a record and rolls back to the original bytes", async () => {
    const root = await createProject();
    const written = await migrate("--project-root", root, "--write");
    expect(written.status).toBe(0);
    expect(written.result.status).toBe("committed");
    expect(await readFile(join(root, "package.json"), "utf8")).toContain('"relkit": "');
    expect(await readFile(join(root, "src/services/auth/better-auth.ts"), "utf8")).toContain(
      "betterAuth({",
    );
    expect((await migrate("--project-root", root)).result.status).toBe("noop");
    const rolled = await migrate("--project-root", root, "--rollback", written.result.receipt);
    expect(rolled.result.status).toBe("rolled-back");
    for (const [path, text] of Object.entries(project))
      expect(await readFile(join(root, path), "utf8")).toBe(text);
    await expect(access(join(root, "src/services/auth/better-auth.ts"))).rejects.toThrow();
  });

  test("refuses to roll back over a later edit and changes nothing", async () => {
    const root = await createProject();
    const written = await migrate("--project-root", root, "--write");
    await writeFile(join(root, "package.json"), '{ "name": "edited" }\n');
    const rolled = await migrate("--project-root", root, "--rollback", written.result.receipt);
    expect(rolled.status).not.toBe(0);
    expect(JSON.stringify(rolled.result)).toContain("RELKIT_MIGRATE_RECOVERY_CONFLICT");
    expect(await readFile(join(root, "src/services/auth/service.ts"), "utf8")).toContain(
      "{ auth }",
    );
  });

  test("rejects --write with --rollback as a usage failure", async () => {
    const { status, result } = await migrate("--write", "--rollback", "record.json");
    expect(status).toBe(2);
    expect(JSON.stringify(result)).toContain("RELKIT_MIGRATE_USAGE");
  });
});
