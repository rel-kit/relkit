/** Shutdown cancels inspection requests before joining generation/proxy ownership. */
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

test("shutdown closes an unfinished bridge body and reaps the exact generation", async () => {
  const root = await makeRoot();
  const hash = "sha256:inspection-shutdown";
  const source = serverSource(hash).replace(
    '  return new Response("not found", { status: 404 });',
    '  if (path === "/_relkit/v1/runtime/slow") return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("started")); } }));\n  return new Response("not found", { status: 404 });',
  );
  const session = await startDev({
    ...options(root, hash),
    inspector: { host: "127.0.0.1", port: 0 },
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(entrypoint, source);
      return { entrypoint };
    },
  });
  await adoptSession(session);
  await waitFor(() => session.inspectionConnection !== undefined);
  const descriptor = session.inspectionConnection!.descriptor;
  const child = session.active!.process;
  const controller = new AbortController();
  try {
    const response = await fetch(descriptor.endpoint + "/_relkit/v1/runtime/slow", {
      signal: controller.signal,
      headers: {
        authorization: "Bearer " + descriptor.token,
        "x-relkit-project-id": descriptor.projectId,
        "x-relkit-session-id": descriptor.sessionId,
      },
    });
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("started");
    const ended = reader.read().then(
      (value) => value.done,
      () => true,
    );
    const started = Date.now();
    await session.stop();
    expect(Date.now() - started).toBeLessThan(5000);
    await child.exited;
    expect(session.activeTarget).toBeUndefined();
    expect(session.inspectionConnection).toBeUndefined();
    expect(await ended).toBe(true);
  } finally {
    controller.abort();
  }
}, 10_000);
