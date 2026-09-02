import { expect, test } from "bun:test";
import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startDev } from "./src/commands/dev.js";
import {
  baseOptions,
  candidateSource,
  fingerprint,
  makeRoot,
  responseText,
  startTrafficSession,
  waitForFile,
  waitForText,
  type DevSession,
} from "./regression-13-13-fixtures.js";

test("preserves active traffic across compile, start, hash, API, and readiness failures", async () => {
  const activeSessions: DevSession[] = [];
  const roots: string[] = [];
  try {
    for (const failure of ["compile", "start", "hash", "api", "readiness"] as const) {
      const root = await makeRoot();
      roots.push(root);
      const graphHash = `sha256:active-${failure}`;
      let attempts = 0;
      const session = await startDev({
        ...baseOptions(root),
        activationFingerprint: fingerprint(graphHash),
        healthTimeoutMs: 40,
        compile: async ({ outputDirectory, token }) => {
          attempts += 1;
          if (token.sourceToken > 1 && failure === "compile")
            throw new Error("candidate compilation failed");
          const entrypoint = join(outputDirectory, "server.ts");
          await writeFile(
            entrypoint,
            candidateSource({
              failure: token.sourceToken > 1 ? failure : undefined,
              generation: token.generationToken,
              graphHash,
            }),
          );
          return { entrypoint };
        },
      });
      activeSessions.push(session);
      const active = session.activeTarget;
      expect(active).toBeDefined();
      expect(await responseText(session, "/hello")).toBe(
        `generation-${active!.token.generationToken}`,
      );
      expect(await session.notifySourceChange(1)).toBe(false);
      expect(session.activeTarget).toEqual(active);
      expect(await responseText(session, "/hello")).toBe(
        `generation-${active!.token.generationToken}`,
      );
      expect(attempts).toBe(2);
      expect(await readdir(join(root, ".relkit", "generated"))).toEqual([
        `generation-${active!.token.generationToken}`,
      ]);
    }
  } finally {
    await Promise.all(activeSessions.map((session) => session.stop()));
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
});

test("rapid saves obsolete stale candidates and activate only the latest generation", async () => {
  const root = await makeRoot();
  let firstStarted!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  let session: DevSession | undefined;
  try {
    session = await startDev({
      ...baseOptions(root),
      activationFingerprint: (candidate) =>
        fingerprint(`sha256:source-${candidate.token.sourceToken}`),
      compile: async ({ outputDirectory, signal, token }) => {
        if (token.sourceToken === 2) {
          firstStarted();
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", resolve, { once: true }),
          );
          throw signal.reason ?? new Error("stale candidate");
        }
        const graphHash = `sha256:source-${token.sourceToken}`;
        const entrypoint = join(outputDirectory, "server.ts");
        await writeFile(
          entrypoint,
          candidateSource({ generation: token.generationToken, graphHash }),
        );
        return { entrypoint };
      },
    });
    const stale = session.notifySourceChange(1);
    await firstStartedPromise;
    const latest = session.notifySourceChange(2);
    expect(await stale).toBe(false);
    expect(await latest).toBe(true);
    expect(session.activeTarget?.token).toEqual({ sourceToken: 3, generationToken: 3 });
    expect(session.activeActivationFingerprint?.graphHash).toBe("sha256:source-3");
    expect(await responseText(session, "/hello")).toBe("generation-3");
    expect(await readdir(join(root, ".relkit", "generated"))).toEqual(["generation-3"]);
  } finally {
    await session?.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("atomically switches traffic and drains the old request before cleanup", async () => {
  const root = await makeRoot();
  const marker = join(root, "hold.started");
  let session: DevSession | undefined;
  let oldRequest: Promise<Response> | undefined;
  try {
    session = await startTrafficSession(root, marker);
    const stablePort = session.backendPort;
    oldRequest = fetch(`http://127.0.0.1:${stablePort}/hold`);
    await waitForFile(marker);
    const activation = session.notifySourceChange(1);
    await waitForText(`http://127.0.0.1:${stablePort}/hello`, "generation-2");
    expect(await activation).toBe(true);
    expect(await (await oldRequest).text()).toBe("generation-1");
    expect(session.backendPort).toBe(stablePort);
    expect(session.activeTarget?.token).toEqual({ sourceToken: 2, generationToken: 2 });
    expect(await readdir(join(root, ".relkit", "generated"))).toEqual(["generation-2"]);
  } finally {
    await session?.stop();
    await oldRequest?.catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test("shutdown cleans the active backend, inspector child, and generation directory", async () => {
  const root = await makeRoot();
  let session: DevSession | undefined;
  try {
    session = await startDev({
      ...baseOptions(root),
      activationFingerprint: fingerprint("sha256:shutdown"),
      inspector: { command: [process.execPath, "-e", "setTimeout(() => {}, 10000)"], port: 0 },
      compile: async ({ outputDirectory, token }) => {
        const entrypoint = join(outputDirectory, "server.ts");
        await writeFile(
          entrypoint,
          candidateSource({ generation: token.generationToken, graphHash: "sha256:shutdown" }),
        );
        return { entrypoint };
      },
    });
    const backend = session.active;
    const inspector = session.inspectorChild;
    await session.stop(new Error("test shutdown"));
    await session.waitForShutdown();
    expect(typeof (await backend?.process.exited)).toBe("number");
    expect(typeof (await inspector?.process.exited)).toBe("number");
    expect(session.activeTarget).toBeUndefined();
    expect(await readdir(join(root, ".relkit", "generated"))).toEqual([]);
  } finally {
    await session?.stop();
    await rm(root, { recursive: true, force: true });
  }
});
