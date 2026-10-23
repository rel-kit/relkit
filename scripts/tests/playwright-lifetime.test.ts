/** Proves actual installed Playwright interruption joins its native server and
 * descendant before evidence cleanup, without spending a real browser instance.
 */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import { scaffoldPort } from "../scaffold-http.js";
import { runPlaywright } from "../playwright-runner.js";
import { playwrightServerCommand } from "../playwright-server-command.js";
import { scaffoldChild } from "../scaffold-process.js";
import { closePlaywright } from "../playwright-cleanup.js";

test("native Playwright SIGINT cleans descendants before fallback ownership runs", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "relkit-playwright-native-"));
  const port = await Effect.runPromise(scaffoldPort);
  try {
    await writeNativeFixture(artifacts, port);
    const require = createRequire(import.meta.url);
    const native = createRequire(require.resolve("@playwright/test/package.json"));
    const cli = join(dirname(native.resolve("playwright/package.json")), "cli.js");
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const owner = yield* scaffoldChild({
            executable: "node",
            cwd: artifacts,
            args: [cli, "test", "--config=playwright.config.mjs"],
            env: {
              RELKIT_E2E_ARTIFACTS: artifacts,
              RELKIT_LIFETIME_PORT: String(port),
              NODE_OPTIONS: "--max-old-space-size=512",
            },
          });
          yield* Effect.addFinalizer(() => Effect.promise(() => closePlaywright(owner, artifacts)));
          yield* Effect.promise(() => awaitEntered(join(artifacts, "entered.txt")));
          process.kill(-owner.process.pid, "SIGINT");
          yield* Effect.promise(() => owner.settled).pipe(Effect.timeout("10 seconds"));
          // These checks run before scope release can invoke the fallback finalizer.
          yield* Effect.promise(() => assertDescendantsClosed(artifacts));
        }),
      ),
    );
  } finally {
    await rm(artifacts, { recursive: true, force: true });
  }
}, 30000);

test("interrupted native Playwright joins its server group and descendant", async () => {
  const artifacts = await mkdtemp(join(tmpdir(), "relkit-playwright-lifetime-"));
  const controller = new AbortController();
  const port = await Effect.runPromise(scaffoldPort);
  await writeNativeFixture(artifacts, port);
  const require = createRequire(import.meta.url);
  const native = createRequire(require.resolve("@playwright/test/package.json"));
  const cli = join(dirname(native.resolve("playwright/package.json")), "cli.js");
  const running = Effect.runPromiseExit(
    runPlaywright(
      {
        executable: "node",
        cwd: artifacts,
        args: [cli, "test", "--config=playwright.config.mjs"],
        env: {
          RELKIT_E2E_ARTIFACTS: artifacts,
          RELKIT_LIFETIME_PORT: String(port),
          NODE_OPTIONS: "--max-old-space-size=512",
        },
      },
      artifacts,
    ),
    { signal: controller.signal },
  );
  try {
    await awaitEntered(join(artifacts, "entered.txt"));
    controller.abort();
    await running;
    await assertDescendantsClosed(artifacts);
  } finally {
    controller.abort();
    await running;
    await rm(artifacts, { recursive: true, force: true });
  }
}, 30000);

/** Verifies native graceful state release and both real process identities. */
async function assertDescendantsClosed(artifacts: string): Promise<void> {
  expect(await readFile(join(artifacts, "graceful.txt"), "utf8")).toBe("SIGTERM");
  const text = await readFile(join(artifacts, "descendants.json"), "utf8");
  const pids = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.Int)))(text);
  for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
}

/** Writes a native installed-runner fixture with a pending test and real server. */
async function writeNativeFixture(artifacts: string, port: number): Promise<void> {
  const require = createRequire(import.meta.url);
  const api = pathToFileURL(
    join(dirname(require.resolve("@playwright/test/package.json")), "index.mjs"),
  ).href;
  const fixture = resolve(import.meta.dir, "fixtures/playwright-lifetime-server.mjs");
  const command = playwrightServerCommand(artifacts, "backend", "node", [fixture]);
  await writeFile(
    join(artifacts, "playwright.config.mjs"),
    `import {defineConfig} from ${JSON.stringify(api)};
export default defineConfig({testDir:${JSON.stringify(artifacts)},testMatch:'lifetime.spec.mjs',workers:1,timeout:30000,
webServer:{command:${JSON.stringify(command)},url:'http://127.0.0.1:${port}',reuseExistingServer:false,gracefulShutdown:{signal:'SIGTERM',timeout:2000}}});`,
  );
  await writeFile(
    join(artifacts, "lifetime.spec.mjs"),
    `import {test} from ${JSON.stringify(api)};
import {writeFile} from 'node:fs/promises';
test('native pending lifetime',async()=>{await writeFile(${JSON.stringify(join(artifacts, "entered.txt"))},'entered');await new Promise(r=>setTimeout(r,20000));});`,
  );
}

/** Bounds startup while retaining the same native test runner's early output. */
async function awaitEntered(file: string): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await Bun.file(file).exists()) return;
    await Bun.sleep(25);
  }
  throw new Error("Native Playwright fixture did not enter its pending test");
}
