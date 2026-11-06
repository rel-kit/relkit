/**
 * Newcomer walkthrough: create a project, add a route, and time how long until the dev server
 * answers it. The project is created from the packed candidate through a local registry that
 * serves its tarballs, with `create-relkit --install`, the same command a newcomer runs with
 * `bunx create-relkit`. Packing the candidate is not part of the time, because a newcomer
 * downloads packages instead of building them.
 *
 *   bun scripts/walkthrough/create-to-first-route.ts [--template minimal] [--output <file>]
 *     [--artifacts <packed release directory>]
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { preparePackedFixture } from "../dev-readiness/packed-fixture.js";
import { option, packedCandidate, Stopwatch, writeWalkthroughResult } from "./support.js";

const root = resolve(import.meta.dir, "../..");

/** The function a newcomer adds beside `hello`. */
const FUNCTION = `/** Says goodbye to a named visitor. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";

export default defineFunction({
  id: "hello.farewell",
  input: z.object({ name: z.string().min(1).default("world") }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }) => ({ message: \`Goodbye, \${name}!\` }),
});
`;

/** The route that exposes it. */
const ROUTE = `/** Maps GET /farewell to the farewell function. */
import { defineRoute } from "relkit/routes";
import hello from "@app/services/hello/service.js";

export const GET = defineRoute({ target: hello.farewell });
`;

/** @returns A port no listener holds right now. */
function freePort(): number {
  const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = probe.port ?? 0;
  void probe.stop(true);
  return port;
}

/**
 * Adds the farewell function and route to a created project.
 * @param project - Project root.
 */
async function addRoute(project: string): Promise<void> {
  const service = join(project, "src/services/hello/service.ts");
  const source = await readFile(service, "utf8");
  await writeFile(
    service,
    source
      .replace(
        'import hello from "@app/services/hello/functions/hello.function.js";',
        'import hello from "@app/services/hello/functions/hello.function.js";\nimport farewell from "@app/services/hello/functions/farewell.function.js";',
      )
      .replace("{ hello }", "{ hello, farewell }"),
  );
  await writeFile(join(project, "src/services/hello/functions/farewell.function.ts"), FUNCTION);
  await mkdir(join(project, "src/routes/farewell"), { recursive: true });
  await writeFile(join(project, "src/routes/farewell/route.ts"), ROUTE);
}

/**
 * Starts `relkit dev` and waits for the new route to answer.
 * @param project - Project root.
 * @returns Completion once `GET /farewell?name=Ada` returns the greeting.
 */
async function waitForRoute(project: string): Promise<void> {
  const port = freePort();
  const server = Bun.spawn(
    [join(project, "node_modules/.bin/relkit"), "dev", "--port", String(port)],
    { cwd: project, env: { ...process.env, CI: "1" }, stdout: "inherit", stderr: "inherit" },
  );
  try {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`relkit dev exited with ${server.exitCode}`);
      const body = await fetch(`http://127.0.0.1:${port}/farewell?name=Ada`).then(
        async (response) => (response.status === 200 ? response.text() : undefined),
        () => undefined,
      );
      if (body?.includes("Goodbye, Ada!") === true) return;
      await Bun.sleep(250);
    }
    throw new Error("The new route did not answer within 180 seconds.");
  } finally {
    server.kill();
    await server.exited;
  }
}

async function main(): Promise<void> {
  const template = option("template") ?? "minimal";
  const candidate = await packedCandidate(root, option("artifacts"));
  console.log(`Candidate packed in ${candidate.packSeconds} s (not part of the walkthrough time)`);
  const clock = new Stopwatch();
  let outcome: "passed" | "failed" = "failed";
  let note = "";
  let temporary: string | undefined;
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* preparePackedFixture(
            root,
            "examples",
            candidate.directory,
            template,
          );
          temporary = fixture.temporary;
          clock.lap("create");
          yield* Effect.promise(async () => {
            await addRoute(fixture.projectRoot);
            clock.lap("route-added");
            await waitForRoute(fixture.projectRoot);
            clock.lap("route-answers");
          });
        }),
      ),
    );
    outcome = "passed";
    note = `create-relkit --template ${template} --install from the packed candidate, one route added, relkit dev answering it; packing the candidate (${candidate.packSeconds} s) is excluded.`;
  } catch (error) {
    note = `Stopped after ${clock.steps.at(-1)?.name ?? "start"}: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
  }
  const seconds = outcome === "passed" ? (clock.steps.at(-1)?.seconds ?? null) : null;
  const result = await writeWalkthroughResult(option("output"), {
    kind: "create-to-first-route",
    outcome,
    seconds,
    steps: clock.steps,
    note,
  });
  console.log(JSON.stringify(result));
  if (outcome === "failed") process.exitCode = 1;
}

if (import.meta.main) await main();
