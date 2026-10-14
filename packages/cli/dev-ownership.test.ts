/** Verifies native asynchronous Inspector acquisition, external shutdown and watched source ownership. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { startDev, type DevOptions } from "./src/commands/dev.js";

import { startDevSourceWatcher } from "./src/commands/dev-watch.js";

import { makeRoot, options, waitFor, adoptSession } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("stops an inspector child through the external shutdown signal", async () => {
  const root = await makeRoot();
  const controller = new AbortController();
  const session = await startDev({
    ...options(root, "sha256:dev-inspector"),
    signal: controller.signal,
    inspector: {
      command: [process.execPath, "-e", "setTimeout(() => {}, 10000)"],
      port: 0,
    },
  });
  await adoptSession(session);
  await waitFor(() => session.inspectorChild !== undefined);
  expect(session.inspectorPort).toBeGreaterThan(0);

  controller.abort(new Error("test shutdown"));
  await session.waitForShutdown();
  expect(session.activeTarget).toBeUndefined();
});

test("releases the backend port when its terminal closes", async () => {
  const root = await makeRoot();
  const existingHandlers = new Set(process.listeners("SIGHUP"));
  const session = await startDev({
    ...options(root, "sha256:dev-hangup"),
    installSignalHandlers: true,
  });
  await adoptSession(session);
  const port = session.backendPort;
  const hangup = process.listeners("SIGHUP").find((handler) => !existingHandlers.has(handler));

  expect(hangup).toBeDefined();
  hangup?.();
  await session.waitForShutdown();

  expect(session.activeTarget).toBeUndefined();
  const replacement = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response() });
  await replacement.stop(true);
});

test("forwards source, directory, and root configuration changes through the watcher", async () => {
  const root = await makeRoot();
  await mkdir(join(root, "src"));
  let builds = 0;
  const session = await startDev({
    ...options(root, "sha256:watcher"),
    compile: async (request) => {
      builds += 1;
      return options(root, "sha256:watcher").compile(request);
    },
  });
  await adoptSession(session);
  const watcher = startDevSourceWatcher(session);
  try {
    await writeFile(join(root, "src", "app.ts"), "export const changed = true;\n");
    await waitFor(() => builds > 1 && session.stateMachine.state === "active");
    const beforeDirectory = builds;
    await mkdir(join(root, "src/routes/live/[id]/details"), { recursive: true });
    await waitFor(() => builds > beforeDirectory && session.stateMachine.state === "active");
    for (const file of ["relkit.config.ts", ".env", ".env.local", "package.json", "bun.lock"]) {
      const before = builds;
      await writeFile(join(root, file), "changed\n");
      await waitFor(
        () => builds > before && session.stateMachine.state === "active",
        `watcher activation after ${file}`,
      );
    }
  } finally {
    watcher.close();
  }
  expect(session.stateMachine.state).toBe("active");
});

test("forwards backend console output through dev logs", async () => {
  const root = await makeRoot();
  const logs: Parameters<NonNullable<DevOptions["onLog"]>>[0][] = [];
  const output: string[] = [];
  const session = await startDev({
    ...options(root, "sha256:console-output"),
    logger: { human: { write: (line) => output.push(line) }, json: false },
    onLog: (event) => logs.push(event),
  });
  await adoptSession(session);

  await fetch(`http://127.0.0.1:${session.backendPort}/hello`);
  await waitFor(() =>
    logs.some(
      (event) =>
        event.event === "candidate.startup-output" &&
        String(event.fields?.output).includes("backend hello"),
    ),
  );
  expect(output.some((line) => /INFO\s+app\s+backend hello/.test(line))).toBe(true);
  expect(output.some((line) => line.includes("candidate.startup-output"))).toBe(false);
});
