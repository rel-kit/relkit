/**
 * Exercises actual private descriptor publication and ownership boundaries in
 * isolated roots. Competing sessions and malicious paths must preserve foreign
 * bytes; discovery does not need executable project configuration or PID probes.
 */
import { mkdtemp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { Effect, Exit } from "effect";
import { InspectionFiles, InspectionFilesLive } from "../src/connection/files.service.js";
import type { InspectionDescriptor } from "../src/connection/protocol.types.js";

const roots: string[] = [];

test("cleanup rejects a connections directory replaced with a symlink", async () => {
  const path = await root();
  const foreign = await root();
  await Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* InspectionFiles;
      const own = descriptor(yield* files.projectId(path));
      const file = yield* files.publish(path, own);
      yield* Effect.promise(() =>
        rename(join(path, ".relkit/connections"), join(foreign, "moved")),
      );
      yield* Effect.promise(() =>
        symlink(join(foreign, "moved"), join(path, ".relkit/connections")),
      );
      expect(Exit.isFailure(yield* Effect.exit(files.removeOwned(file, own)))).toBe(true);
      expect(
        yield* Effect.promise(() =>
          readFile(join(foreign, "moved", `${own.sessionId}.json`), "utf8"),
        ),
      ).toContain(own.token);
    }).pipe(Effect.provide(InspectionFilesLive)),
  );
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** Creates only test-owned roots; cleanup never touches application directories. */
async function root() {
  const path = await mkdtemp(join(tmpdir(), "relkit-inspection-"));
  roots.push(path);
  return path;
}

/** Builds trusted test metadata with independent session credentials. */
function descriptor(projectId: string): InspectionDescriptor {
  return {
    protocol: 1,
    projectId,
    sessionId: randomUUID(),
    endpoint: "http://127.0.0.1:43210",
    process: { pid: process.pid, startedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    token: randomBytes(32).toString("base64url"),
  };
}

test("publishes private atomic session files and removes only its own descriptor", async () => {
  const path = await root();
  await Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* InspectionFiles;
      const own = descriptor(yield* files.projectId(path));
      const file = yield* files.publish(path, own);
      expect((yield* files.read(file)).descriptor).toEqual(own);
      expect((yield* files.list(path)).files.map((entry) => entry.descriptor.sessionId)).toEqual([
        own.sessionId,
      ]);
      expect((yield* Effect.promise(() => stat(file))).mode & 0o777).toBe(0o600);
      expect(
        (yield* Effect.promise(() => stat(join(path, ".relkit/connections")))).mode & 0o777,
      ).toBe(0o700);
      expect(yield* files.removeOwned(file, descriptor(own.projectId))).toBe(false);
      expect(yield* files.removeOwned(file, own)).toBe(true);
      expect((yield* files.list(path)).files).toEqual([]);
    }).pipe(Effect.provide(InspectionFilesLive)),
  );
});

test("colliding publication and stale cleanup preserve another session's bytes", async () => {
  const path = await root();
  await Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* InspectionFiles;
      const own = descriptor(yield* files.projectId(path));
      const file = yield* files.publish(path, own);
      const collision = { ...own, token: randomBytes(32).toString("base64url") };
      expect(Exit.isFailure(yield* Effect.exit(files.publish(path, collision)))).toBe(true);
      expect(yield* files.removeOwned(file, collision)).toBe(false);
      expect((yield* files.read(file)).descriptor).toEqual(own);
      const other = descriptor(own.projectId);
      yield* files.publish(path, other);
      expect((yield* files.list(path)).files).toHaveLength(2);
    }).pipe(Effect.provide(InspectionFilesLive)),
  );
});

test("rejects symlink escapes and leaves the target untouched", async () => {
  const path = await root();
  const foreign = await root();
  await mkdir(join(path, ".relkit"));
  await symlink(foreign, join(path, ".relkit/connections"));
  await writeFile(join(foreign, "keep"), "foreign");
  await Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* InspectionFiles;
      const own = descriptor(yield* files.projectId(path));
      expect(Exit.isFailure(yield* Effect.exit(files.publish(path, own)))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(files.list(path)))).toBe(true);
    }).pipe(Effect.provide(InspectionFilesLive)),
  );
  expect(await readFile(join(foreign, "keep"), "utf8")).toBe("foreign");
});

test("discovery needs no config execution and canonical roots have distinct identities", async () => {
  const path = await root();
  const other = await root();
  await writeFile(join(path, "relkit.config.ts"), 'throw new Error("must not execute")');
  await Effect.runPromise(
    Effect.gen(function* () {
      const files = yield* InspectionFiles;
      expect(yield* files.projectId(path)).not.toBe(yield* files.projectId(other));
      expect((yield* files.list(path)).files).toEqual([]);
    }).pipe(Effect.provide(InspectionFilesLive)),
  );
});
