/** Preserves real installed CLI create, first-start budget, manual preparation and production startup acceptance. */
import { expect } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installedCliFixture,
  installedCreateArguments,
  installedCliCommand,
  rejectUnsupportedInstalledCreate,
  assertInstalledManifest,
  type InstalledCliFixture,
} from "./installed-cli.fixture.js";
import { launchPreparedProject } from "./installed-cli-runtime.fixture.js";

/** Runs the original acceptance with optional already verified candidate archives and unchanged cleanup. */
export async function verifyInstalledCliCreation(artifactDirectory?: string): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "relkit-npm-create-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const fixture = await installedCliFixture(parent, artifactDirectory);
    server = fixture.server;
    await rejectUnsupportedInstalledCreate(fixture);
    await verifyInstalledCreate(fixture);
  } finally {
    if (server !== undefined) await server.stop(true);
    await rm(parent, { recursive: true, force: true });
  }
}

/** Retains create-child exit/output ownership until every application assertion is finished. */
async function verifyInstalledCreate(fixture: InstalledCliFixture) {
  const child = Bun.spawn(
    [process.execPath, ...installedCreateArguments(fixture.cliBin, "app", fixture.project, true)],
    {
      cwd: fixture.parent,
      env: fixture.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  try {
    expect(await child.exited, (await output).join("\n")).toBe(0);
    await assertInstalledManifest(fixture);
    await verifyFirstStart(fixture.project);
    await verifyManualPreparation(fixture);
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
    await output;
  }
}

/**
 * The first `relkit dev` of a freshly created project answers within the startup budget
 * without any preparation step, and leaves no development snapshot behind.
 */
async function verifyFirstStart(project: string) {
  const launched = await launchPreparedProject(project);
  expect(launched.body).toBe('{"message":"Hello, RelKit!"}');
  // Five seconds on an ordinary host; a saturated one may raise it, and says so in its report.
  expect(launched.durationMs).toBeLessThan(
    Number(process.env.RELKIT_FIRST_START_BUDGET_MS ?? 5_000),
  );
  await expect(access(join(project, ".relkit/dev/current.json"))).rejects.toThrow();
}

/** Preserves no-install next steps, explicit prepare, frozen lockfile and all four project scripts. */
async function verifyManualPreparation(fixture: InstalledCliFixture) {
  const manual = join(fixture.parent, "manual");
  const created = JSON.parse(
    await installedCliCommand(
      process.execPath,
      installedCreateArguments(fixture.cliBin, "manual", manual, false),
      fixture.parent,
      fixture.env,
    ),
  );
  expect(created.nextSteps.commands).toMatchObject({
    install: "bun install",
    prepare: "bunx --no-install relkit dev --prepare",
    dev: "bun run dev",
  });
  await installedCliCommand(process.execPath, ["install"], manual, fixture.env);
  expect(
    await installedCliCommand(
      process.execPath,
      ["x", "--no-install", "relkit", "dev", "--prepare"],
      manual,
      fixture.env,
    ),
  ).toContain("Checked");
  expect((await launchPreparedProject(manual)).body).toBe('{"message":"Hello, RelKit!"}');
  await installedCliCommand(
    process.execPath,
    ["install", "--frozen-lockfile"],
    manual,
    fixture.env,
  );
  for (const script of ["check", "typecheck", "test", "build"] as const)
    await installedCliCommand(process.execPath, ["run", script], manual, fixture.env);
  expect((await launchPreparedProject(manual, "start")).body).toBe('{"message":"Hello, RelKit!"}');
}
