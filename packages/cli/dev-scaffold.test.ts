/** Verifies native watcher admission waits for real scaffold publication or rollback while retaining active traffic. */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { test } from "bun:test";

import { startDev } from "./src/commands/dev.js";

import { startDevSourceWatcher } from "./src/commands/dev-watch.js";

import {
  verifyScaffoldCycle,
  verifyCrashedScaffold,
} from "../../tests/fixtures/cli/dev-scaffold-cycle.js";
import { makeRoot, options, adoptSession } from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("holds reload until a real scaffold transaction finishes installation or rollback", async () => {
  const root = await makeRoot();
  await mkdir(join(root, "src"));
  let builds = 0;
  const activeScaffoldMarkers: string[] = [];
  const session = await startDev({
    ...options(root, "sha256:scaffold"),
    compile: async (request) => {
      builds++;
      activeScaffoldMarkers.push(
        ...(await readdir(root)).filter((file) => file.startsWith(".relkit-scaffold-")),
      );
      return options(root, "sha256:scaffold").compile(request);
    },
  });
  await adoptSession(session);
  const watcher = startDevSourceWatcher(session);
  try {
    for (const fail of [false, true]) {
      await verifyScaffoldCycle(root, session, () => builds, activeScaffoldMarkers, fail);
    }
    await verifyCrashedScaffold(root, session, () => builds);
  } finally {
    watcher.close();
  }
}, 15_000);
