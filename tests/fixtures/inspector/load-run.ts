/**
 * Sends sequential mixed requests through a real generated server with the Inspector attached and
 * compares the Inspector's request history with what the server answered. Runs on Node and on Bun.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { generatedAppFixture } from "./generated-app.js";
import { LOAD_APP, LOAD_KINDS, sendLoadRequest } from "./load-app.js";

/** One history row as the Inspector's request API returns it. */
interface HistoryRequest {
  readonly requestId: string;
  readonly status?: number | null;
  readonly outcome?: string | null;
}

/** @returns A loopback port nothing listens on. */
function freePort() {
  return new Promise<number>((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close(() => done(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/** Starts the built Inspector with the current runtime and owns its process. */
async function launchTool(projectRoot: string) {
  const port = await freePort();
  const bin = resolve(import.meta.dirname, "../../../packages/inspector/dist/bin.js");
  const args = ["--project-root", projectRoot, "--port", String(port)];
  const child = spawn(process.execPath, [bin, ...args], { stdio: "ignore" });
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited.finally(() => clearTimeout(timer));
  };
  return { api: `http://127.0.0.1:${port}/_relkit/backend/_relkit/v1`, close };
}

/** Polls an Inspector endpoint until its JSON satisfies a condition. */
async function until<T>(url: string, done: (value: T) => boolean, ms: number): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await fetch(url).then(
      (response) => response.json() as Promise<T>,
      () => undefined,
    );
    if (last !== undefined && done(last)) return last;
    await sleep(250);
  }
  throw new Error(`${url} did not reach the expected state: ${JSON.stringify(last)}`);
}

/** Reads the whole request history, newest first. */
async function history(api: string): Promise<HistoryRequest[]> {
  const items: HistoryRequest[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 1000; page++) {
    const query = `limit=100&order=desc${cursor === undefined ? "" : `&cursor=${cursor}`}`;
    const body = (await (await fetch(`${api}/requests?${query}`)).json()) as {
      items: HistoryRequest[];
      nextCursor?: string;
    };
    items.push(...body.items);
    cursor = body.nextCursor;
    if (cursor === undefined || body.items.length === 0) break;
  }
  return items;
}

/** What a run sent and what history kept, per request kind. */
export interface LoadRunResult {
  readonly sent: number;
  readonly perSecond: number;
  /** Answers whose status differed from the plan. */
  readonly unexpectedStatus: number;
  readonly missing: Readonly<Record<string, number>>;
  /** Requests whose history row has no status: a start without an end, "in progress". */
  readonly inProgress: Readonly<Record<string, number>>;
  /** Requests recorded with another status than the one the client received. */
  readonly wrongStatus: Readonly<Record<string, number>>;
  /** History rows per request id; more than one would be a duplicate. */
  readonly duplicates: number;
  readonly outcomes: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly recordsLostBeforeHistory: unknown;
}

/**
 * Runs the plan `total` times round-robin, sequentially, then waits for history to hold them all.
 * @param total - Number of requests.
 * @returns The comparison of history with the answers.
 */
export async function runHistoryLoad(total: number): Promise<LoadRunResult> {
  const fixture = await generatedAppFixture(true, LOAD_APP);
  let tool: Awaited<ReturnType<typeof launchTool>> | undefined;
  try {
    const origin = `http://127.0.0.1:${fixture.session.backendPort}`;
    tool = await launchTool(fixture.projectRoot);
    await until<{ state?: string }>(
      `${tool.api}/storage`,
      (body) => body.state === "ready",
      30_000,
    );
    const sent: { kind: string; expected: number; status: number; requestId?: string }[] = [];
    const started = performance.now();
    for (let index = 0; index < total; index++) {
      const kind = LOAD_KINDS[index % LOAD_KINDS.length]!;
      sent.push({
        kind: kind.kind,
        expected: kind.status,
        ...(await sendLoadRequest(origin, kind)),
      });
    }
    const perSecond = total / ((performance.now() - started) / 1000);
    const ids = new Set(sent.map((entry) => entry.requestId));
    let rows: HistoryRequest[] = [];
    const deadline = Date.now() + 60_000;
    // History is complete once every sent request has a row with a status, or the wait ends.
    while (Date.now() < deadline) {
      rows = (await history(tool.api)).filter((row) => ids.has(row.requestId));
      if (rows.length >= sent.length && rows.every((row) => typeof row.status === "number")) break;
      await sleep(1000);
    }
    const storage = (await (await fetch(`${tool.api}/storage`)).json()) as {
      recordsLostBeforeHistory?: unknown;
    };
    const byId = new Map(rows.map((row) => [row.requestId, row]));
    const count = (table: Record<string, number>, key: string) => {
      table[key] = (table[key] ?? 0) + 1;
    };
    const missing: Record<string, number> = {};
    const inProgress: Record<string, number> = {};
    const wrongStatus: Record<string, number> = {};
    const outcomes: Record<string, Record<string, number>> = {};
    for (const entry of sent) {
      const row = byId.get(entry.requestId ?? "");
      if (row === undefined) count(missing, entry.kind);
      else if (typeof row.status !== "number") count(inProgress, entry.kind);
      else if (row.status !== entry.status) count(wrongStatus, entry.kind);
      if (row !== undefined) count((outcomes[entry.kind] ??= {}), String(row.outcome));
    }
    return {
      sent: sent.length,
      perSecond,
      unexpectedStatus: sent.filter((entry) => entry.status !== entry.expected).length,
      missing,
      inProgress,
      wrongStatus,
      duplicates: rows.length - byId.size,
      outcomes,
      recordsLostBeforeHistory: storage.recordsLostBeforeHistory,
    };
  } finally {
    await tool?.close();
    await fixture.close();
  }
}
