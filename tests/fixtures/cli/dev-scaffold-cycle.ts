/** Exercises the native scaffold fence with completed, rolled-back and crashed transaction owners. */
import { expect } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyScaffoldPlan } from "../../../packages/cli/src/scaffolding/add-transaction.js";
import type { ScaffoldPlan } from "create-relkit/internal/add-types";
import type { startDev } from "../../../packages/cli/src/commands/dev.js";
import { waitFor } from "./dev-fixture.js";

/**
 * Exercises one actual generator transaction while the original dev SDK retains active traffic.
 * @param root - Runner-owned source root.
 * @param session - Original scoped dev session.
 * @param builds - Current native compiler admission count.
 * @param markers - Every transaction marker observed by compilation.
 * @param fail - Whether the native installer deliberately rejects publication.
 * @returns Completion after transaction settlement and its admitted activation.
 */
export async function verifyScaffoldCycle(
  root: string,
  session: Awaited<ReturnType<typeof startDev>>,
  builds: () => number,
  markers: readonly string[],
  fail: boolean,
): Promise<void> {
  const before = builds(),
    name = fail ? "rollback" : "added";
  const applying = applyScaffoldPlan(scaffoldPlan(root, name), {
    commandRunner: async (command) => {
      if (command[1] !== "install") return { exitCode: 0 };
      await Bun.sleep(350);
      expect(builds()).toBe(before);
      await writeFile(join(root, "bun.lock"), "installed\n");
      await Bun.sleep(150);
      expect(builds()).toBe(before);
      return { exitCode: fail ? 1 : 0 };
    },
  });
  if (fail) await expect(applying).rejects.toThrow();
  else await applying;
  await waitFor(() => builds() > before && session.stateMachine.state === "active");
  await Bun.sleep(250);
  expect(markers).toEqual([]);
  expect(await Bun.file(join(root, `src/${name}.ts`)).exists()).toBe(!fail);
}

/**
 * Supplies the complete native generator plan without altering its operation contract.
 * @param root - Owned source root.
 * @param name - Controlled transaction outcome name.
 * @returns One function operation plus its install dependency.
 */
function scaffoldPlan(root: string, name: string): ScaffoldPlan {
  return {
    projectRoot: root,
    request: { kind: "function", name, install: true, internal: false, projectRoot: root },
    operations: [{ path: `src/${name}.ts`, action: "create", content: "export {};\n" }],
    dependencies: { example: "1.0.0" },
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
  };
}

/**
 * Proves a disappeared native transaction owner stops fencing queued source changes.
 * @param root - Runner-owned source root.
 * @param session - Original admitted dev session.
 * @param builds - Current native compiler admission count.
 * @returns Completion only after the owned process exits and activation is observed.
 */
export async function verifyCrashedScaffold(
  root: string,
  session: Awaited<ReturnType<typeof startDev>>,
  builds: () => number,
): Promise<void> {
  const crashed = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  try {
    const before = builds();
    await writeFile(join(root, `.relkit-scaffold-${crashed.pid}-abcdef.tmp`), "");
    await writeFile(join(root, "src/crashed.ts"), "export {};\n");
    await Bun.sleep(200);
    expect(builds()).toBe(before);
    crashed.kill();
    await crashed.exited;
    await waitFor(() => builds() > before && session.stateMachine.state === "active");
  } finally {
    if (crashed.exitCode === null) crashed.kill();
    await crashed.exited;
  }
}
