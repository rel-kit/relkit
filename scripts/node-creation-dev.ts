/**
 * Development-server step of the Node creation smoke: `<manager> run dev` answers the example
 * route and a route that reads the scaffolded database, then stops cleanly on SIGINT.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { freePort, isListening, start, stop, waitForOk } from "./node-creation-process.js";
import { commands, fail, step, type Project, type StepResult } from "./node-creation-steps.js";

/** Matches any coded RelKit error block. */
export const ERROR_BLOCK = /\bRELKIT_[A-Z0-9_]+\b/;

/**
 * Writes the three files that read the scaffolded `items` table: a function, its service and a
 * route. `add database` adds no route of its own.
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
    "src/services/items/service.ts": [
      'import { defineService } from "relkit/services";',
      'import listItems from "./functions/list-items.function.js";',
      "",
      "export default defineService({ functions: { listItems } });",
      "",
    ].join("\n"),
    "src/routes/items/route.ts": [
      'import { defineRoute } from "relkit/routes";',
      'import items from "@app/services/items/service.js";',
      "",
      "export const GET = defineRoute({ target: items.listItems });",
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
  await step(results, "dev answers /hello and a database route, then stops on SIGINT", async () => {
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
    } catch (cause) {
      await stop(dev);
      throw cause;
    }
    const finished = await stop(dev);
    if (finished.code !== 130)
      fail(command.join(" "), finished, "Expected exit status 130 after SIGINT.");
    if (!finished.output.includes("Development server stopped"))
      fail(command.join(" "), finished, "The stop did not print `Development server stopped`.");
    if (ERROR_BLOCK.test(finished.output))
      fail(command.join(" "), finished, "The stop printed an error block.");
    if (await isListening(port)) throw new Error(`Port ${port} is still open after the stop.`);
  });
}
