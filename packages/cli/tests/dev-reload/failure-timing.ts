/**
 * Timing and output helpers for the reload-failure tests: they measure how long a running
 * `relkit dev` takes to report a failed reload or to serve a revision, and cut the failure's
 * terminal block out of the output, so the tests can assert the budget and the presentation.
 */
import { functionSource } from "./dev-reload.fixture.js";
import type { DevFixture, DevProcess } from "./dev-reload.fixture.types.js";

/** Same bound for every reload-failure test; see compile-failure.test.ts for why 3 s. */
export const BUDGET_MS = 3_000;

/** Function file the tests break and fix. */
export const FUNCTION_FILE = "src/services/beta/functions/b1.function.ts";

/**
 * Waits for the type-check watch's first pass: a fast compiler can finish it on the old file and
 * not report a save made while it ran.
 * @param dev - Running development server.
 */
export async function typeCheckSettled(dev: DevProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!/ types +(No type errors|\d+ type errors?)/u.test(dev.output()) && Date.now() < deadline)
    await Bun.sleep(100);
}

/**
 * Waits until the output after an offset reports a failed reload.
 * @param dev - Running development server.
 * @param from - Output offset taken before the save.
 * @param deadlineMs - Milliseconds to wait.
 * @returns Milliseconds waited, or undefined when nothing was reported.
 */
export async function failureReported(
  dev: DevProcess,
  from: number,
  deadlineMs: number,
): Promise<number | undefined> {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    if (dev.output().slice(from).includes("Reload failed")) return Date.now() - started;
    await Bun.sleep(20);
  }
  return undefined;
}

/**
 * Polls `/b1` until it serves a message.
 * @param dev - Running development server.
 * @param message - Expected message.
 * @param deadlineMs - Milliseconds to wait.
 * @returns Milliseconds waited, or undefined when it never served it.
 */
export async function served(
  dev: DevProcess,
  message: string,
  deadlineMs: number,
): Promise<number | undefined> {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    if ((await dev.get("/b1"))?.message === message) return Date.now() - started;
    await Bun.sleep(20);
  }
  return undefined;
}

/**
 * Saves a valid revision of the function and waits until it serves, so a test does not depend
 * on how the previous one ended.
 * @param dev - Running development server.
 * @param fixture - Application on disk.
 * @param revision - Revision to serve.
 */
export async function settle(dev: DevProcess, fixture: DevFixture, revision: string) {
  if ((await dev.get("/b1"))?.message === `b1 ${revision}`) return;
  fixture.write(FUNCTION_FILE, functionSource("b1", revision));
  await dev.waitFor("/b1", `b1 ${revision}`, 60_000);
}

/**
 * Cuts the first failure block after an offset: its timestamped line and the indented lines
 * that continue it, as one line: the terminal wraps long lines at word boundaries.
 * @param dev - Running development server.
 * @param from - Output offset.
 * @returns The block's words separated by single spaces.
 */
export function failureBlock(dev: DevProcess, from: number): string {
  const lines = dev.output().slice(from).split("\n");
  const start = lines.findIndex((line) => line.includes("Reload failed"));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\d{2}:\d{2}:\d{2}\.\d{3} /u.test(line));
  return [lines[start]!, ...rest.slice(0, end < 0 ? rest.length : end)]
    .join(" ")
    .replace(/\s+/gu, " ");
}
