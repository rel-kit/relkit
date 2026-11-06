/** Bundles full reports and committed summaries into the release evidence asset. */
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bundleEvidence, creationSummary } from "../../scripts/release-evidence.ts";
import { report } from "../fixtures/create-certification.ts";

const fixture = await mkdtemp(join(tmpdir(), "relkit-release-evidence-"));

afterAll(() => rm(fixture, { recursive: true, force: true }));

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(join(fixture, path)), { recursive: true });
  await writeFile(join(fixture, path), text);
}

test("the creation summary is short and names where the full reports are", () => {
  const summary = creationSummary("9.9.9", {
    fresh: report("fresh", true),
    restart: report("restart", true),
  });
  expect(summary).toContain("# create-relkit 9.9.9 creation evidence");
  expect(summary).toMatch(/^\| fresh \| 20 \| passed \|/mu);
  expect(summary).toContain("evidence-<version>.tar.gz");
  expect(summary.split("\n").length).toBeLessThan(20);
});

test("the bundle holds every report and the committed summaries", async () => {
  await put("repo/docs/evidence/create-capabilities/9.9.9.md", "# summary\n");
  await put("reports/versioning/create-capabilities/9.9.9/fresh.json", "{}\n");
  await put("reports/creation-capability/minimal/result.json", "{}\n");
  const output = join(fixture, "out");
  await mkdir(output);
  const result = await bundleEvidence({
    root: join(fixture, "repo"),
    version: "1.2.3",
    reports: [join(fixture, "reports/versioning"), join(fixture, "reports/creation-capability")],
    output,
  });
  expect(result).toEqual({ archive: join(output, "evidence-1.2.3.tar.gz"), files: 2 });
  const listing = Bun.spawnSync(["tar", "-tzf", result.archive]).stdout.toString();
  expect(listing.split("\n").filter((line) => !line.endsWith("/"))).toEqual(
    expect.arrayContaining([
      "evidence-1.2.3/reports/versioning/create-capabilities/9.9.9/fresh.json",
      "evidence-1.2.3/reports/creation-capability/minimal/result.json",
      "evidence-1.2.3/summaries/create-capabilities/9.9.9.md",
    ]),
  );
  expect(await readFile(`${result.archive}.sha256`, "utf8")).toMatch(
    /^[0-9a-f]{64} {2}evidence-1\.2\.3\.tar\.gz\n$/u,
  );
});

test("bundling without reports fails", async () => {
  await expect(
    bundleEvidence({
      root: join(fixture, "repo"),
      version: "1.2.3",
      reports: [join(fixture, "missing")],
      output: join(fixture, "out"),
    }),
  ).rejects.toThrow("No evidence reports found");
});
