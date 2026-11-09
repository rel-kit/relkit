/** Keeps report artifacts, raw evidence, an oversized docs directory and personal paths out of the repository. */
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DOCS_LIMIT_BYTES,
  PATH_ALLOWLIST,
  checkRepository,
  pathFindings,
} from "../../scripts/repository-hygiene.ts";
import { fileSizeProblems } from "../../scripts/file-size.ts";

const root = resolve(import.meta.dir, "../..");
const fixture = await mkdtemp(join(tmpdir(), "relkit-hygiene-"));

afterAll(() => rm(fixture, { recursive: true, force: true }));

async function put(path: string, text: string | Uint8Array): Promise<string> {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), text);
  return path;
}

test("the repository passes", () => {
  expect(checkRepository(root)).toEqual([]);
});

test("a committed bug-fix report fails and names the file", async () => {
  const files = [
    await put("bug-fix-reports/issues/bf-1/report.md", "# report\n"),
    await put("bug-fix-ui-reports/format.json", "{}\n"),
  ];
  expect(checkRepository(fixture, files).map(({ rule, file }) => [rule, file])).toEqual([
    ["report-artifact", "bug-fix-reports/issues/bf-1/report.md"],
    ["report-artifact", "bug-fix-ui-reports/format.json"],
  ]);
});

test("raw evidence under docs/evidence fails; Markdown summaries pass", async () => {
  const files = [
    await put("docs/evidence/0.9.0.md", "# 0.9.0 release evidence\n"),
    await put("docs/evidence/lean-install/baseline.json", "{}\n"),
  ];
  expect(checkRepository(fixture, files).map(({ rule, file }) => [rule, file])).toEqual([
    ["raw-evidence", "docs/evidence/lean-install/baseline.json"],
  ]);
});

test("docs/ at 5 MB fails", async () => {
  const files = [await put("docs/large.md", new Uint8Array(DOCS_LIMIT_BYTES))];
  expect(checkRepository(fixture, files).map(({ rule }) => rule)).toEqual(["docs-size"]);
});

test("personal and temporary paths fail with file and line", () => {
  const home = ["", "Users", "someone", "project", "file.ts"].join("/");
  const temporary = ["", "private", "var", "folders", "ab", "xyz", "T", "relkit"].join("/");
  const linux = ["", "home", "someone", ".bun", "bin"].join("/");
  const windows = ["C:", "Users", "someone", "relkit"].join("\\");
  const findings = pathFindings(
    "notes.md",
    ["fine", home, temporary, linux, windows, "/tmp/relkit-fixture"].join("\n"),
  );
  expect(findings.map(({ rule, file, line }) => [rule, file, line])).toEqual([
    ["personal-path", "notes.md", 2],
    ["personal-path", "notes.md", 3],
    ["personal-path", "notes.md", 4],
    ["personal-path", "notes.md", 5],
  ]);
});

test("CI runner homes, URL segments and allowlisted files pass", () => {
  const runner = ["", "home", "runner", "work", "relkit"].join("/");
  const macRunner = ["", "Users", "runner", ".bun", "bin", "bun"].join("/");
  const segment = "fumadocs-ui/layouts/home/slots/container";
  expect(pathFindings("ci.json", [runner, macRunner, segment].join("\n"))).toEqual([]);
  const allowed = Object.keys(PATH_ALLOWLIST)[0]!;
  expect(pathFindings(allowed, ["", "Users", "someone", "x"].join("/"))).toEqual([]);
});

test("the 250-line limit fails new and growing files and shrinks the baseline", () => {
  expect(
    fileSizeProblems(["a.ts (251 lines)", "b.ts (300 lines)", "c.ts (400 lines)"], {
      "b.ts": 300,
      "c.ts": 390,
      "d.ts": 260,
    }),
  ).toEqual([
    "a.ts has 251 lines; split it to 250 or fewer.",
    "c.ts grew from 390 to 400 lines; it may only shrink.",
    "d.ts is within 250 lines now; remove it from scripts/file-size-baseline.json.",
  ]);
});
