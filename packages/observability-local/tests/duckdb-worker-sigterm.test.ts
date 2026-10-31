/** A group SIGTERM leaves the worker to its parent's ordered close instead of losing the flush. */
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import type { LocalWorkerCommand, LocalWorkerResponse } from "@relkit/observability/local/record";
import { createWorkerClientState, failWorkerClient } from "../src/local/worker-client-state.js";

const entry = fileURLToPath(new URL("../src/local/duckdb-worker.ts", import.meta.url));

test("worker survives SIGTERM until its parent closes the database", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-worker-sigterm-"));
  const child = fork(entry, [], { execPath: "bun", stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  let id = 0;
  const call = (command: LocalWorkerCommand) =>
    new Promise<LocalWorkerResponse>((resolve) => {
      const current = ++id;
      const listener = (reply: LocalWorkerResponse) => {
        if (reply.id !== current) return;
        child.off("message", listener);
        resolve(reply);
      };
      child.on("message", listener);
      child.send({ id: current, command });
    });
  try {
    expect(
      (await call({ type: "open", root, retention: { maxAgeMs: Number.MAX_SAFE_INTEGER } })).error,
    ).toBeUndefined();
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect([child.exitCode, child.signalCode]).toEqual([null, null]);
    expect((await call({ type: "close" })).error).toBeUndefined();
    expect(await exited).toBe(0);
  } finally {
    child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("a failed client still terminates the worker that ignores SIGTERM", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-worker-failed-"));
  const child = fork(entry, [], { execPath: "bun", stdio: ["ignore", "ignore", "pipe", "ipc"] });
  const state = createWorkerClientState(child, () => undefined);
  try {
    const opened = new Promise<LocalWorkerResponse>((resolve) => child.once("message", resolve));
    child.send({ id: 1, command: { type: "open", root, retention: { maxAgeMs: 60_000 } } });
    expect((await opened).error).toBeUndefined();
    failWorkerClient(state, new Error("worker timed out"));
    await state.exited;
    expect(child.signalCode).toBe("SIGKILL");
  } finally {
    child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("worker ignoring SIGTERM still exits when its parent disconnects", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-worker-orphan-"));
  const child = fork(entry, [], { execPath: "bun", stdio: ["ignore", "ignore", "inherit", "ipc"] });
  const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
  try {
    const opened = new Promise<LocalWorkerResponse>((resolve) => child.once("message", resolve));
    child.send({ id: 1, command: { type: "open", root, retention: { maxAgeMs: 60_000 } } });
    expect((await opened).error).toBeUndefined();
    child.kill("SIGTERM");
    child.disconnect();
    expect(await exited).toBe(0);
  } finally {
    child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
