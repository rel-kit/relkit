/** Keeps user-facing text on the "RelKit" spelling and free of internal process terms. */
import { afterAll, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkUserText, cliStrings, markdownProse } from "../../scripts/user-text.ts";

const root = resolve(import.meta.dir, "../..");
const fixture = await mkdtemp(join(tmpdir(), "relkit-user-text-"));
afterAll(() => rm(fixture, { recursive: true, force: true }));

test("the repository passes", () => {
  expect(checkUserText(root)).toEqual([]);
});

test("a fixture with an old spelling and a banned term fails with locations", async () => {
  await Bun.spawn(["git", "init", "-q"], { cwd: fixture }).exited;
  await mkdir(join(fixture, "apps/docs/content/docs"), { recursive: true });
  await mkdir(join(fixture, "packages/cli/src"), { recursive: true });
  await writeFile(
    join(fixture, "README.md"),
    "# RelKit\n\nRuns on the reference-host readiness evidence.\n\n```sh\necho RELKIT tuple\n```\n",
  );
  await writeFile(
    join(fixture, "apps/docs/content/docs/index.mdx"),
    "---\ntitle: Home\n---\n\nWelcome to Relkit. Use `AcceptRunReceipt` here.\n",
  );
  await writeFile(
    join(fixture, "packages/cli/src/run.ts"),
    'fail("RELKIT_X", "The cohort was rejected.");\nconst label = "cohort.json";\nconst name = "RELKIT";\n',
  );
  await mkdir(join(fixture, "packages/diagnostics/src/codes"), { recursive: true });
  await writeFile(
    join(fixture, "packages/diagnostics/src/codes/cli.ts"),
    'export const cliCodes = [{ code: "RELKIT_X", title: "Bad `cohort`", happened: "Relkit failed.", fix: "Check the cohort." }];\n',
  );
  await cp(join(root, "WRITING.md"), join(fixture, "WRITING.md"));
  const findings = checkUserText(fixture).map(({ file, line, column, rule, text }) =>
    [file, line, column, rule, text].join(" "),
  );
  expect(findings).toContain("README.md 3 28 banned-term readiness evidence");
  expect(findings).toContain("apps/docs/content/docs/index.mdx 5 12 spelling Relkit");
  expect(findings).toContain("packages/cli/src/run.ts 1 23 banned-term cohort");
  expect(findings).toContain("packages/cli/src/run.ts 3 15 spelling RELKIT");
  expect(findings).toContain("packages/diagnostics/src/codes/cli.ts 1 80 spelling Relkit");
  expect(findings).toContain("packages/diagnostics/src/codes/cli.ts 1 113 banned-term cohort");
  expect(findings.filter((finding) => finding.startsWith("packages/diagnostics"))).toHaveLength(2);
  expect(findings.some((finding) => finding.includes("tuple"))).toBe(false);
  expect(findings.some((finding) => finding.includes("Receipt"))).toBe(false);
  expect(findings.some((finding) => finding.includes("cohort.json"))).toBe(false);
});

test("prose excludes code, links and the augmentable type namespace", () => {
  const [prose] = markdownProse(
    'See [docs](https://x.dev/RELKIT) and `Relkit` <Tag a="cohort" />.',
  );
  expect(prose?.text).not.toMatch(/RELKIT|Relkit|cohort/u);
  const { strings } = cliStrings("a.ts", 'const s = "declare global { namespace Relkit {} }";');
  expect(strings.map(({ text }) => text)).toEqual(["declare global { namespace Relkit {} }"]);
});
