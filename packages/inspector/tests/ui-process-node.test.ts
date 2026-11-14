/** The launcher runs on Node too (`npm run inspector`): the interface starts there and is served. */
import { expect, it } from "@effect/vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { acquireInspectorUi } from "../src/ui-native.service.js";

/** @returns A loopback port nothing listens on. */
function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

it.live("on Node the interface child starts on Node and answers before listening is logged", () =>
  Effect.gen(function* () {
    expect(process.versions.bun).toBeUndefined();
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-ui-node-")));
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => rm(root, { recursive: true, force: true })),
    );
    const entry = join(root, "server.mjs");
    const receipt = join(root, "receipt.json");
    yield* Effect.promise(() =>
      writeFile(
        entry,
        `import { createServer } from "node:http"; import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ bun: process.versions.bun ?? null, node: process.versions.node }));
createServer((_, res) => res.end("ok")).listen(Number(process.env.PORT), process.env.HOSTNAME);`,
      ),
    );
    const port = yield* Effect.promise(freePort);
    const exited = yield* acquireInspectorUi(
      entry,
      { hostname: "127.0.0.1", port },
      "http://127.0.0.1:1",
      "private",
    );
    expect(exited).toBeDefined();
    const started = JSON.parse(yield* Effect.promise(() => readFile(receipt, "utf8")));
    expect(started).toEqual({ bun: null, node: process.versions.node });
    const page = yield* Effect.promise(() => fetch(`http://127.0.0.1:${port}/`));
    expect(page.status).toBe(200);
  }).pipe(Effect.scoped),
);
