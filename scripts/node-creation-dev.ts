/**
 * Development-server step of the Node creation smoke: `<manager> run dev` answers the example
 * route and a route that reads the scaffolded database, admits a same-origin `POST` that writes it
 * and denies a cross-origin one (RK-39), then stops cleanly on SIGINT.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  freePort,
  isListening,
  start,
  stop,
  stoppedByInterrupt,
  waitForOk,
} from "./node-creation-process.js";
import { commands, fail, step, type Project, type StepResult } from "./node-creation-steps.js";

/** Matches any coded RelKit error block. */
export const ERROR_BLOCK = /\bRELKIT_[A-Z0-9_]+\b/;

/** Origin of the cross-origin request the development server must deny. */
const FOREIGN_ORIGIN = "http://attacker.example";

/**
 * Sends a same-origin and a cross-origin JSON `POST /items`; the first must be served and the
 * second denied with 403 `origin-denied`.
 * @param origin - Public origin of the development server, such as `http://127.0.0.1:4100`.
 * @param send - Fetch capability.
 * @returns The same-origin answer's body.
 */
export async function postsAreOriginChecked(
  origin: string,
  send: typeof fetch = fetch,
): Promise<string> {
  const post = (from: string) =>
    send(`${origin}/items`, {
      method: "POST",
      headers: { origin: from, "content-type": "application/json" },
      body: JSON.stringify({ name: "from the smoke" }),
      signal: AbortSignal.timeout(30_000),
    });
  const same = await post(origin);
  const created = await same.text();
  if (!same.ok)
    throw new Error(`A same-origin POST /items answered ${same.status}: ${created.slice(0, 500)}`);
  const cross = await post(FOREIGN_ORIGIN);
  const denied = await cross.text();
  if (cross.status !== 403 || !denied.includes('"origin-denied"'))
    throw new Error(
      `A cross-origin POST /items answered ${cross.status}, not 403 origin-denied: ${denied.slice(0, 500)}`,
    );
  return created;
}

/**
 * Writes the files that read and write the scaffolded `items` table: two functions, their service
 * and a route. `add database` adds no route of its own.
 * @param project - The project.
 */
async function writeItemsRoute(project: Project): Promise<void> {
  const files: Record<string, string> = {
    "src/services/items/functions/list-items.function.ts": [
      'import { defineFunction } from "relkit/functions";',
      'import { z } from "zod";',
      "",
      "export default defineFunction({",
      "  input: z.object({}),",
      "  output: z.object({ items: z.array(z.object({ id: z.number(), name: z.string() })) }),",
      "  handler: async (_input, context) => ({ items: await context.database.items.findMany() }),",
      "});",
      "",
    ].join("\n"),
    "src/services/items/functions/add-item.function.ts": [
      'import { defineFunction } from "relkit/functions";',
      'import { z } from "zod";',
      "",
      "export default defineFunction({",
      "  input: z.object({ name: z.string().min(1) }),",
      "  output: z.object({ id: z.number(), name: z.string() }),",
      "  handler: async (input, context) => {",
      "    const saved = await context.database.items.insert({ data: { name: input.name } });",
      "    return { id: saved.id, name: saved.name };",
      "  },",
      "});",
      "",
    ].join("\n"),
    "src/services/items/service.ts": [
      'import { defineService } from "relkit/services";',
      'import addItem from "./functions/add-item.function.js";',
      'import listItems from "./functions/list-items.function.js";',
      "",
      "export default defineService({ functions: { addItem, listItems } });",
      "",
    ].join("\n"),
    "src/routes/items/route.ts": [
      'import { defineRoute } from "relkit/routes";',
      'import items from "@app/services/items/service.js";',
      "",
      "export const GET = defineRoute({ target: items.listItems });",
      "export const POST = defineRoute({ target: items.addItem });",
      "",
    ].join("\n"),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(project.directory, path)), { recursive: true });
    await writeFile(join(project.directory, path), text);
  }
}

/**
 * Starts the development server, requests the example route and the database route, then stops it
 * with SIGINT and requires a clean stop.
 * @param project - The project, with a migrated database.
 * @param results - Step collector.
 * @param runtime - Runtime description printed with the answer.
 */
export async function devReadsDatabase(
  project: Project,
  results: StepResult[],
  runtime: string,
): Promise<void> {
  const name = "dev answers /hello, reads and writes the database by origin, stops on SIGINT";
  await step(results, name, async () => {
    await writeItemsRoute(project);
    const port = await freePort();
    const command = commands(project).script("dev");
    console.log(`$ ${command.join(" ")} (PORT=${port})`);
    const dev = start(command, project.directory, { ...project.env, PORT: String(port) }, true);
    try {
      const hello = await waitForOk(`http://127.0.0.1:${port}/hello?name=RelKit`, dev, 240_000);
      console.log(
        `${project.manager} run dev on ${runtime} answered GET /hello: ${hello.slice(0, 200)}`,
      );
      const items = JSON.parse(await waitForOk(`http://127.0.0.1:${port}/items`, dev, 60_000));
      if (!Array.isArray(items.items))
        throw new Error(`GET /items did not return the table's rows: ${JSON.stringify(items)}`);
      console.log(`GET /items read the database: ${JSON.stringify(items)}`);
      const created = await postsAreOriginChecked(`http://127.0.0.1:${port}`);
      console.log(`Same-origin POST /items wrote ${created}; cross-origin POST /items got 403`);
    } catch (cause) {
      await stop(dev);
      throw cause;
    }
    const finished = await stop(dev);
    if (!stoppedByInterrupt(finished))
      fail(command.join(" "), finished, "Expected exit status 130 after SIGINT.");
    if (!finished.output.includes("Development server stopped"))
      fail(command.join(" "), finished, "The stop did not print `Development server stopped`.");
    if (ERROR_BLOCK.test(finished.output))
      fail(command.join(" "), finished, "The stop printed an error block.");
    if (await isListening(port)) throw new Error(`Port ${port} is still open after the stop.`);
  });
}
