/** Proves inspection borrows the exact generation until its response body ends. */
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

/** Creates an owned backend with one explicitly releasable inspection response. */
async function streamingSession(root: string) {
  const graphHash = "sha256:inspection-drain";
  const source = `let finishInspection;\n${serverSource(graphHash)}`.replace(
    '  return new Response("not found", { status: 404 });',
    `  if (path === "/_relkit/v1/runtime/slow") return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("started")); finishInspection = () => { controller.enqueue(new TextEncoder().encode("finished")); controller.close(); }; } }));
  if (path === "/release-inspection") { finishInspection?.(); return new Response("released"); }
  return new Response("not found", { status: 404 });`,
  );
  return startDev({
    ...options(root, graphHash),
    inspector: { host: "127.0.0.1", port: 0 },
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(entrypoint, source);
      return { entrypoint };
    },
  });
}

test("a live inspection body drains its old generation while a new backend serves", async () => {
  const session = await streamingSession(await makeRoot());
  await adoptSession(session);
  await waitFor(() => session.inspectionConnection !== undefined);
  const descriptor = session.inspectionConnection!.descriptor;
  const old = session.active!;
  const controller = new AbortController();
  let activation: Promise<boolean> | undefined;
  try {
    const response = await fetch(`${descriptor.endpoint}/_relkit/v1/runtime/slow`, {
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        "x-relkit-project-id": descriptor.projectId,
        "x-relkit-session-id": descriptor.sessionId,
      },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("started");
    activation = session.activate(1);
    await waitFor(() => session.active !== old, "new generation published before inspection drain");
    expect(old.process.exitCode).toBeNull();
    expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe(
      "hello",
    );
    await fetch(`http://127.0.0.1:${old.port}/release-inspection`);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("finished");
    expect((await reader.read()).done).toBe(true);
    expect(await activation).toBe(true);
    await old.process.exited;
  } finally {
    controller.abort();
    await activation?.catch(() => undefined);
  }
}, 15_000);
