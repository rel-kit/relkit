/** Builds the owned native installer and rollback evidence for the inherited-pipe transaction test; the test retains cancellation, child joining and server cleanup. */

import { expect } from "@effect/vitest";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeAddRequest } from "../../src/scaffolding/add-options.js";
import { AddScaffoldError, type ScaffoldPlan } from "create-relkit/internal/add-types";

/** Opens the original readiness barrier for parent and descendant process identities.
 * @returns Native server and test-owned entered/release barriers; caller must stop and release them.
 */
export function installerServer() {
  const entered = Promise.withResolvers<{ parent: number; descendant: number }>();
  const release = Promise.withResolvers<void>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const query = new URL(request.url).searchParams;
      entered.resolve({
        parent: Number(query.get("parent")),
        descendant: Number(query.get("child")),
      });
      await release.promise;
      return new Response("continue");
    },
  });
  return { entered, release, server };
}

/** Writes the installer and descendant programs into the transaction-owned temporary root.
 * @param root - Owned temporary project directory.
 * @param serverUrl - Native readiness server address.
 * @returns Installer path after its bytes and executable mode are delivered.
 */
export async function prepareInstaller(root: string, serverUrl: string) {
  await Promise.all([
    writeFile(join(root, "value.ts"), "original"),
    writeFile(join(root, "bun.lock"), "lock-original"),
    writeFile(join(root, "bun.lockb"), "binary-original"),
  ]);
  const descendant = [
    `await fetch(${JSON.stringify(serverUrl)} + "?parent=" + process.env.RELKIT_PARENT_PID + "&child=" + process.pid);`,
    'await Bun.write("value.ts", "late-install-write");',
    'await Bun.write("bun.lock", "late-lock-write");',
    'await Bun.write("bun.lockb", "late-binary-write");',
  ].join("\n");
  const installer = join(root, "installer");
  await writeFile(
    installer,
    [
      `#!${process.execPath}`,
      `const child = Bun.spawn([process.execPath, "-e", ${JSON.stringify(descendant)}], {`,
      '  stdout: "inherit", stderr: "inherit",',
      "  env: { ...process.env, RELKIT_PARENT_PID: String(process.pid) },",
      "});",
      "await child.exited;",
    ].join("\n"),
    { mode: 0o755 },
  );
  return installer;
}

/** Builds the same update and install plan used to observe native rollback.
 * @param root - Owned temporary project root.
 * @returns The original request, dependency and update operation.
 */
export function nativeRollbackPlan(root: string): ScaffoldPlan {
  return {
    request: {
      ...normalizeAddRequest(["function", "Sample", "--project-root", root]),
      install: true,
    },
    projectRoot: root,
    operations: [{ path: "value.ts", action: "update", content: "updated" }],
    dependencies: { effect: "4.0.1" },
    artifacts: [],
    profiles: [],
    warnings: [],
    nextSteps: [],
  };
}

/** Retains every rollback assertion after the parent and descendant actually settle.
 * @typeParam Failure - Original transaction failure observed by the caller.
 * @param root - Owned temporary project root.
 * @param failure - Original rejected transaction value.
 * @param completedBeforeDescendant - Evidence that cleanup awaited inherited native pipes.
 * @returns Completion after checking bytes, cancellation fields and temporary-file cleanup.
 */
export async function assertNativeRollback<Failure>(
  root: string,
  failure: Failure,
  completedBeforeDescendant: boolean,
) {
  const restored = await Promise.all(
    ["value.ts", "bun.lock", "bun.lockb"].map((path) => readFile(join(root, path), "utf8")),
  );
  expect(failure).toBeInstanceOf(AddScaffoldError);
  expect(failure).toMatchObject({ code: "RELKIT_ADD_CANCELLED", exitCode: 130 });
  expect(restored).toEqual(["original", "lock-original", "binary-original"]);
  expect(completedBeforeDescendant).toBe(false);
  expect((await readdir(root)).filter((path) => path.endsWith(".tmp"))).toEqual([]);
}
