/**
 * Inspector step of the Node creation smoke: `relkit add inspector`, then `<manager> run inspector`
 * with no development server running. It must listen, serve its page and stop cleanly on SIGINT.
 */
import { assertCandidateInstalled, type Candidate } from "./node-creation-candidate.js";
import { ERROR_BLOCK } from "./node-creation-dev.js";
import {
  freePort,
  isListening,
  start,
  stop,
  stoppedByInterrupt,
  waitForOk,
  waitForOutput,
} from "./node-creation-process.js";
import {
  commands,
  fail,
  mustSucceed,
  step,
  type Project,
  type StepResult,
} from "./node-creation-steps.js";

/**
 * Adds the Inspector, installs it and runs it against a project with no `relkit dev` session.
 * @param candidate - The prepared candidate.
 * @param project - The project.
 * @param results - Step collector.
 */
export async function inspectorListens(
  candidate: Candidate,
  project: Project,
  results: StepResult[],
): Promise<void> {
  const run = commands(project);
  await step(results, "add inspector and install", async () => {
    await mustSucceed(project, run.relkit(["add", "inspector"]));
    await assertCandidateInstalled(candidate, project, ["@relkit/inspector"]);
  });
  await step(results, "inspector listens, serves / and stops on SIGINT with 130", async () => {
    const port = await freePort();
    const command = run.script("inspector", ["--port", String(port)]);
    console.log(`$ ${command.join(" ")}`);
    const inspector = start(command, project.directory, project.env, true);
    try {
      await waitForOutput(inspector, /RelKit Inspector listening/, 120_000);
      await waitForOutput(inspector, /No running `relkit dev` session/, 30_000);
      await waitForOk(`http://127.0.0.1:${port}/`, inspector, 30_000);
    } catch (cause) {
      await stop(inspector);
      throw cause;
    }
    const finished = await stop(inspector);
    if (!stoppedByInterrupt(finished))
      fail(command.join(" "), finished, "Expected exit status 130 after SIGINT.");
    if (ERROR_BLOCK.test(finished.output))
      fail(command.join(" "), finished, "The stop printed an error block (RELKIT_INTERRUPTED).");
    if (await isListening(port)) throw new Error(`Port ${port} is still open after the stop.`);
  });
}
