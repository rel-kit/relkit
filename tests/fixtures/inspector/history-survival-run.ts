/**
 * Runs the history store through what broke it during the logistics audit, with real processes: a
 * real `relkit dev` session of a generated application and the built Inspector tool.
 * 1. A request whose body escapes an unpaired surrogate (`"\ud800"`) leaves a log record DuckDB's
 *    JSON column refuses; collection must go on, and the requests after it must reach history.
 * 2. A second Inspector for the same project starts, retries and stops; the first one's worker,
 *    owner file and collection must not change.
 * 3. The first Inspector's worker is killed; the status must say history is unavailable at once,
 *    the worker must come back, and the requests sent meanwhile must reach history.
 * 4. The application stops; the status must say it is unreachable while history stays ready.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generatedAppFixture } from "./generated-app.js";
import { LOAD_APP } from "./load-app.js";
import {
  historyWorkers,
  launchTool,
  storage,
  stored,
  until,
  type StorageStatus,
  type ToolProcess,
} from "./tool-process.js";

/** What each step observed. */
export interface HistorySurvivalResult {
  readonly afterPoison: StorageStatus;
  readonly poisonStored: boolean;
  readonly secondStatus: StorageStatus;
  readonly workerBeforeSecond: readonly number[];
  readonly workerAfterSecond: readonly number[];
  readonly ownerUnchanged: boolean;
  readonly collectedWhileSecondRan: boolean;
  readonly collectedAfterSecondStopped: boolean;
  /** The status read right after the worker was killed. */
  readonly afterKill: StorageStatus;
  readonly msUntilReported: number;
  readonly workerAfterRestart: readonly number[];
  readonly afterRestart: StorageStatus;
  readonly sentDuringGapStored: boolean;
  readonly applicationDown: StorageStatus;
}

const collecting = (status: StorageStatus) =>
  status.state === "ready" && status.collection === "collecting";

/**
 * Runs the four steps against one generated application.
 * @returns What was observed; a step that never reaches its state throws with the tool's output.
 */
export async function runHistorySurvival(): Promise<HistorySurvivalResult> {
  const fixture = await generatedAppFixture(true, LOAD_APP);
  const origin = `http://127.0.0.1:${fixture.session.backendPort}`;
  const tools: ToolProcess[] = [];
  /** Sends one request to the application and returns its request ID. */
  const send = async (path: string, body?: string) => {
    const response = await fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body, headers: { "content-type": "application/json" } }),
    });
    await response.arrayBuffer();
    return response.headers.get("x-request-id") ?? "";
  };
  try {
    const first = await launchTool(fixture.projectRoot);
    tools.push(first);
    const wait = <T>(read: () => Promise<T>, done: (value: T) => boolean, ms: number, what: string) =>
      until(read, done, ms, what).catch((cause: Error) => {
        throw new Error(`${cause.message}\n${first.output().slice(-4000)}`);
      });
    await wait(() => storage(first), collecting, 30_000, "first Inspector collecting");

    // 1. A record DuckDB's JSON column would refuse, then an ordinary request after it.
    const poison = await send("/items", '{"name":"a\\ud800b"}');
    const after = await send("/hello?name=after-poison");
    await wait(() => stored(first, after), Boolean, 15_000, "request after the refused record stored");
    const afterPoison = await storage(first);
    const poisonStored = await stored(first, poison);

    // 2. A second Inspector for the same project, while the first holds the history.
    const owner = join(fixture.projectRoot, ".relkit/observability/.inspector-owner.json");
    const ownerBefore = await readFile(owner, "utf8");
    const workerBeforeSecond = historyWorkers(first);
    const second = await launchTool(fixture.projectRoot);
    tools.push(second);
    const secondStatus = await wait(
      () => storage(second),
      (status) => status.error === "history.writer-conflict",
      30_000,
      "second Inspector refused the history",
    );
    // Let it retry its opening a few times.
    await new Promise((done) => setTimeout(done, 4000));
    const during = await send("/hello?name=second-running");
    const collectedWhileSecondRan = await wait(() => stored(first, during), Boolean, 15_000, "collected");
    await second.close();
    const afterSecond = await send("/hello?name=second-stopped");
    const collectedAfterSecondStopped = await wait(
      () => stored(first, afterSecond),
      Boolean,
      15_000,
      "collected after the second Inspector stopped",
    );
    const workerAfterSecond = historyWorkers(first);
    const ownerUnchanged = (await readFile(owner, "utf8")) === ownerBefore;

    // 3. The worker dies; requests keep coming while it is away.
    const killed = Date.now();
    for (const pid of workerAfterSecond) process.kill(pid, "SIGKILL");
    const afterKill = await wait(
      () => storage(first),
      (status) => status.collection === "history-unavailable",
      5000,
      "worker loss reported",
    );
    const msUntilReported = Date.now() - killed;
    const gap = await send("/hello?name=during-gap");
    const afterRestart = await wait(() => storage(first), collecting, 30_000, "worker restarted");
    const sentDuringGapStored = await wait(() => stored(first, gap), Boolean, 15_000, "gap stored");
    const workerAfterRestart = historyWorkers(first);

    // 4. The application stops while history is healthy.
    await fixture.session.stop();
    const applicationDown = await wait(
      () => storage(first),
      (status) => status.collection === "application-unreachable",
      15_000,
      "application outage reported",
    );
    return {
      afterPoison,
      poisonStored,
      secondStatus,
      workerBeforeSecond,
      workerAfterSecond,
      ownerUnchanged,
      collectedWhileSecondRan,
      collectedAfterSecondStopped,
      afterKill,
      msUntilReported,
      workerAfterRestart,
      afterRestart,
      sentDuringGapStored,
      applicationDown,
    };
  } finally {
    for (const tool of tools) await tool.close();
    await fixture.close();
  }
}
