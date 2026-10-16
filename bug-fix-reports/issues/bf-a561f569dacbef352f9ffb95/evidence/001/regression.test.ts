import { expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startDev } from "../../src/commands/dev.js";
import { startDevSourceWatcher } from "../../src/commands/dev-watch.js";
import {
  adoptSession,
  makeRoot,
  options,
  registerDevCleanup,
} from "../../../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("manual watcher admission returns synchronously in the acquired session scope", async () => {
  const root = await makeRoot();
  await mkdir(join(root, "src"));
  const session = await startDev(options(root, "sha256:synchronous-watch"));
  await adoptSession(session);
  const url = `http://127.0.0.1:${session.backendPort}/hello`;
  expect(await (await fetch(url)).text()).toBe("hello");
  const watcher = startDevSourceWatcher(session);
  expect(typeof watcher.close).toBe("function");
  watcher.close();
  await session.stop();
  expect(session.activeTarget).toBeUndefined();
});
