/**
 * 26.6 (a): a new version that reports a coded startup failure of its own and then exits before
 * it is ready ends `relkit dev` with that diagnostic (code, message and next step), not with
 * `RELKIT_INTERNAL_ERROR` and a request to report a bug; an exit without one keeps it.
 */
import { Cause, Effect, Exit } from "effect";
import { expect, test } from "vitest";
import {
  createHeldOutput,
  failOnCandidateExit,
  logCandidateEvent,
} from "../../src/commands/dev-activation-exit.js";
import type { DevActivationAttempt } from "../../src/commands/dev-activation.types.js";
import { errorLines, toFailure } from "../../src/main-support.js";
import type { StartedCandidate } from "../../src/supervisor/index.js";

const DETAIL = 'provider.bucket.local connection field "bucketName" is required';
const RECORD = `\u001e${JSON.stringify({
  version: 2,
  signal: "log",
  level: "error",
  component: "runtime.provider",
  message: "Provider startup failed",
  // The worker's detail repeats the code, as the provider registry's message does.
  fields: {
    code: "RELKIT_PROVIDER_CONFIGURATION_INVALID",
    detail: `RELKIT_PROVIDER_CONFIGURATION_INVALID: ${DETAIL}`,
  },
})}\n`;

/**
 * Runs the exit watch for a process that exited with code 0, and renders the command's last lines.
 * @param stdout - What the process retained on standard output.
 * @param streamed - Output blocks logged while it ran, before the exit.
 * @returns The terminal error lines.
 */
async function finalLines(stdout: string, streamed: readonly string[] = []): Promise<string[]> {
  const failure = await finalFailure(stdout, streamed);
  return errorLines(failure.code, failure.message);
}

/**
 * Runs the exit watch for a process that exited with code 0.
 * @param stdout - What the process retained on standard output.
 * @param streamed - Output blocks logged while it ran, before the exit.
 * @returns The failure the command line reports and exits with.
 */
async function finalFailure(stdout: string, streamed: readonly string[] = []) {
  const output = createHeldOutput(true);
  for (const block of streamed)
    logCandidateEvent(output, () => undefined, {
      level: "info",
      event: "candidate.startup-output",
      fields: { stream: "stdout", output: block },
    });
  const attempt = {
    signal: new AbortController().signal,
    output,
    session: { projectRoot: "/project" },
  } as unknown as DevActivationAttempt;
  const candidate = {
    exited: Promise.resolve(0),
    output: Promise.resolve({ stdout, stderr: "", truncated: false }),
  } as unknown as StartedCandidate;
  const exit = await Effect.runPromiseExit(failOnCandidateExit(attempt, candidate));
  if (!Exit.isFailure(exit)) throw new Error("The exit watch did not fail.");
  return toFailure(Cause.squash(exit.cause), new AbortController().signal);
}

test("ends with the worker's own coded diagnostic and its next step", async () => {
  const lines = await finalLines(`starting\n${RECORD}`);
  expect(lines[0]).toBe(`RELKIT_PROVIDER_CONFIGURATION_INVALID: ${DETAIL}`);
  expect(lines[1]).toMatch(/^ {2}next: Check the provider's connection settings/);
  expect(lines.join("\n")).not.toMatch(/RELKIT_INTERNAL_ERROR|issue tracker/);
});

test("finds the diagnostic in output logged while it ran, beyond what was retained", async () => {
  const lines = await finalLines("x".repeat(8_192), [`noise\n${RECORD}`]);
  expect(lines[0]).toBe(`RELKIT_PROVIDER_CONFIGURATION_INVALID: ${DETAIL}`);
});

test("keeps RELKIT_INTERNAL_ERROR for an exit without a coded diagnostic", async () => {
  const lines = await finalLines("starting\n");
  expect(lines[0]).toBe(
    "RELKIT_INTERNAL_ERROR: The new version exited with code 0 before it was ready.",
  );
});

test("a version that exits with code 0 before it is ready still fails the command", async () => {
  expect((await finalFailure(`starting\n${RECORD}`)).exitCode).toBe(1);
  expect((await finalFailure("starting\n")).exitCode).toBe(1);
});
