/** Actual Node child ownership: exit, pending readiness cancellation and private environment isolation. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect, Fiber, Schedule } from "effect";
import { acquireInspectorUi } from "../src/ui-native.service.js";

/** Gives the native adapter one exact executable fixture and an unused loopback UI port. */
async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), "relkit-ui-owner-"));
  const entry = join(root, "server.mjs");
  const marker = join(root, "receipt.json");
  await writeFile(
    entry,
    `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, secret: process.env.RELKIT_INSPECTOR_SESSION_TOKEN }));\n${source}`,
  );
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port!;
  await probe.stop(true);
  return {
    entry,
    marker,
    options: { hostname: "127.0.0.1", port },
    close: () => rm(root, { recursive: true, force: true }),
  };
}

/** Reads only the owned child receipt while startup remains in progress. */
function receipt(path: string) {
  return Effect.tryPromise({
    try: async () => JSON.parse(await readFile(path, "utf8")) as { pid: number; secret?: string },
    catch: (cause) => cause,
  }).pipe(Effect.retry(Schedule.spaced(10)), Effect.timeout(2000));
}

test("a native UI exit fails acquisition immediately with its actual exit code", async () => {
  const f = await fixture("process.exit(17);");
  try {
    await expect(
      Effect.runPromise(
        Effect.scoped(acquireInspectorUi(f.entry, f.options, "http://127.0.0.1:1", "private")),
      ),
    ).rejects.toMatchObject({
      operation: "ui.exited",
      cause: { message: "Inspector UI exited (17)" },
    });
  } finally {
    await f.close();
  }
});

test("interrupting pending readiness joins the exact child before fixture release", async () => {
  const f = await fixture("setInterval(() => {}, 1000);");
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(acquireInspectorUi(f.entry, f.options, "http://127.0.0.1:1", "private")),
          );
          const child = yield* receipt(f.marker);
          expect(() => process.kill(child.pid, 0)).not.toThrow();
          yield* Fiber.interrupt(fiber);
          expect(() => process.kill(child.pid, 0)).toThrow();
        }),
      ),
    );
  } finally {
    await f.close();
  }
});

test("the UI child does not inherit an application's bridge token", async () => {
  const f = await fixture("setInterval(() => {}, 1000);");
  const previous = process.env.RELKIT_INSPECTOR_SESSION_TOKEN;
  process.env.RELKIT_INSPECTOR_SESSION_TOKEN = "must-stay-server-only";
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            Effect.scoped(acquireInspectorUi(f.entry, f.options, "http://127.0.0.1:1", "private")),
          );
          expect((yield* receipt(f.marker)).secret).toBeUndefined();
          yield* Fiber.interrupt(fiber);
        }),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.RELKIT_INSPECTOR_SESSION_TOKEN;
    else process.env.RELKIT_INSPECTOR_SESSION_TOKEN = previous;
    await f.close();
  }
});
