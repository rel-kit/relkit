/** Verifies native candidate rejection preserves active traffic and bounded activation fingerprints. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { startDev, type DevOptions } from "./src/commands/dev.js";

import {
  makeRoot,
  options,
  serverSource,
  adoptSession,
} from "../../tests/fixtures/cli/dev-fixture.js";
import { registerDevCleanup } from "../../tests/fixtures/cli/dev-fixture.js";

registerDevCleanup();

test("keeps the active backend when a later candidate fails", async () => {
  const root = await makeRoot();
  const graphHash = "sha256:dev-failure";
  let attempts = 0;
  const session = await startDev({
    ...options(root, graphHash),
    compile: async (request) => {
      attempts += 1;
      if (attempts > 1) throw new Error("invalid source");
      return options(root, graphHash).compile(request);
    },
  });
  await adoptSession(session);
  const target = session.activeTarget;

  expect(await session.notifySourceChange(1, ["relkit.config.ts"])).toBe(false);
  expect(session.activeTarget).toEqual(target);
  expect(session.stateMachine.state).toBe("active");
  expect(await (await fetch(`http://127.0.0.1:${session.backendPort}/hello`)).text()).toBe("hello");
});

test("retains fingerprints only for active or draining generations across failed verifications", async () => {
  const root = await makeRoot();
  const graphHash = "sha256:bounded-fingerprints";
  let attempts = 0;
  const session = await startDev({
    ...options(root, graphHash),
    healthTimeoutMs: 150,
    compile: async ({ outputDirectory }) => {
      const entrypoint = join(outputDirectory, "server.ts");
      await writeFile(
        entrypoint,
        serverSource(++attempts % 2 === 0 ? "sha256:rejected" : graphHash),
      );
      return { entrypoint };
    },
  });
  await adoptSession(session);
  for (let version = 1; version <= 6; version += 1) {
    const previous = session.active;
    expect(await session.notifySourceChange(version, ["relkit.config.ts"])).toBe(version % 2 === 0);
    if (version % 2 === 1) expect(session.active).toBe(previous);
    expect(session.fingerprints.size).toBe(1);
    expect(session.drains.size).toBe(1);
    const active = session.active;
    expect(active).toBeDefined();
    if (active === undefined) throw new Error("Active native generation disappeared");
    expect(session.fingerprints.has(active.token.generationToken)).toBe(true);
  }
  await session.stop();
  expect(session.fingerprints.size).toBe(0);
  expect(session.drains.size).toBe(0);
}, 15_000);

test("preserves the initial candidate failure", async () => {
  const root = await makeRoot();
  const logs: Parameters<NonNullable<DevOptions["onLog"]>>[0][] = [];
  const failure = Object.assign(new Error("local lease held"), {
    code: "RELKIT_LOCAL_LEASE_HELD",
  });

  await expect(
    startDev({
      ...options(root, "sha256:initial-failure"),
      compile: async () => {
        throw failure;
      },
      onLog: (event) => logs.push(event),
    }),
  ).rejects.toBe(failure);
  expect(logs.some((event) => event.event === "dev.generation.failed")).toBe(false);
});
