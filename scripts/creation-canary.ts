/**
 * Creation canary for one template, using the creator packed from this checkout: packs the
 * candidate, creates the template with installation from a local registry, starts its dev command
 * until the app responds, then runs its test command. Pull requests that change creation run it for
 * every template; the nightly canary checks the published creator instead.
 *
 *   bun scripts/creation-canary.ts --template api
 */
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CREATE_TEMPLATES } from "create-relkit";

const root = resolve(import.meta.dir, "..");

/** Packed benchmark report fields the canary reads. */
interface DiagnosticReport {
  readonly fixture: { readonly temporary: string; readonly projectRoot: string };
  readonly identity: { readonly bun: { readonly version: string } };
  readonly attempts: readonly { readonly sample: { readonly outcome: string } }[];
}

async function run(args: readonly string[], cwd: string): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: { ...process.env, CI: "1" },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`bun ${args.join(" ")} failed in ${cwd} (${code})`);
}

async function main(): Promise<void> {
  const index = process.argv.indexOf("--template");
  const requested = index < 0 ? undefined : process.argv[index + 1];
  const template = CREATE_TEMPLATES.find((value) => value === requested);
  if (template === undefined)
    throw new Error(`--template must be one of: ${CREATE_TEMPLATES.join("|")}`);
  const output = join(root, "test-results", "creation-canary", `${template}.json`);
  await run(
    [
      "scripts/benchmark-packed-dev.ts",
      "--template",
      template,
      "--set",
      "diagnostic",
      "--runs",
      "1",
      "--output",
      output,
    ],
    root,
  );
  const report = JSON.parse(await readFile(output, "utf8")) as DiagnosticReport;
  try {
    const outcome = report.attempts[0]?.sample.outcome;
    if (outcome !== "response")
      throw new Error(
        `The ${template} template's dev command did not respond on Bun ${report.identity.bun.version} (${outcome ?? "no attempt"}).`,
      );
    await run(["run", "test"], report.fixture.projectRoot);
    console.log(`${template}: created, dev responded and tests passed on Bun ${Bun.version}`);
  } finally {
    await rm(report.fixture.temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();
