/** Proves a promoted inspector policy switches the bridge without waiting for the old generation's drain. */
import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startDev } from "./src/commands/dev.js";
import {
  makeRoot,
  options,
  serverSource,
  waitFor,
  adoptSession,
  registerDevCleanup,
} from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("disabling inspection stops the bridge while the previous generation still drains", async () => {
  const graphHash = "sha256:inspection-reconfigure";
  const source = `${serverSource(graphHash)}`.replace(
    '  return new Response("not found", { status: 404 });',
    `  if (path === "/slow") return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("started")); globalThis.finishSlow = () => controller.close(); } }));
  if (path === "/release") { globalThis.finishSlow?.(); return new Response("released"); }
  return new Response("not found", { status: 404 });`,
  );
  let disabled = false;
  const session = await startDev({
    ...options(await makeRoot(), graphHash),
    inspector: { host: "127.0.0.1", port: 0 },
    inspectionPolicy: () => (disabled ? false : undefined),
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(entrypoint, source);
      return { entrypoint };
    },
  });
  await adoptSession(session);
  await waitFor(() => session.inspectionConnection !== undefined);
  const old = session.active!;
  const controller = new AbortController();
  let activation: Promise<boolean> | undefined;
  try {
    // An in-flight application request leases the old generation, holding its drain open.
    const response = await fetch(`http://127.0.0.1:${session.backendPort}/slow`, {
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("started");
    disabled = true;
    activation = session.activate(1);
    await waitFor(() => session.active !== old, "new generation published");
    await waitFor(() => session.inspectionConnection === undefined, "bridge stopped before drain");
    expect(old.process.exitCode).toBeNull();
    await fetch(`http://127.0.0.1:${old.port}/release`);
    expect(await activation).toBe(true);
  } finally {
    controller.abort();
    await activation?.catch(() => undefined);
  }
}, 20_000);
