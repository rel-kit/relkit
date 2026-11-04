/** Raw route, middleware and `server.onStart` probes that reach the application through `getRelkit()`. */
export const generatedHandleSources = {
  "src/routes/handle/route.ts": `/** Raw route that reads the database and calls a function through the runtime handle. */
import { getRelkit } from "relkit";
import { defineRoute } from "relkit/routes";

export const GET = defineRoute({
  handler: async () => {
    const relkit = getRelkit();
    const rows = await relkit.database.records.findMany();
    const { count } = await relkit.functions.records.probe({ mode: "read" });
    return Response.json({ rows: rows.length, count });
  },
});
`,
  "src/routes/middleware/handle.middleware.ts": `/** Middleware that calls a function through the runtime handle before the raw route runs. */
import { getRelkit } from "relkit";
import { defineMiddleware } from "relkit/routes";

export default defineMiddleware("/handle", async (context, next) => {
  const { count } = await getRelkit().functions.records.probe({ mode: "read" });
  await next();
  context.res.headers.set("x-handle", String(count));
});
`,
} as const;

/** The server setting that records what `onStart` sees through the runtime handle. */
const onStartServer = `  server: {
    port: 3000,
    onStart: async () => {
      const { count } = await getRelkit().functions.records.probe({ mode: "read" });
      await writeFile(String(process.env.RELKIT_TEST_ON_START), JSON.stringify({ count }));
    },
  },`;

/**
 * Adds the `onStart` probe to the fixture's application configuration.
 * @param config - Fixture `relkit.config.ts` source with `server: { port: 3000 },`.
 * @returns The configuration with the probe and its imports.
 */
export function withOnStartProbe(config: string): string {
  if (!config.includes("  server: { port: 3000 },"))
    throw new Error("Fixture configuration has no server setting to extend");
  return (
    'import { writeFile } from "node:fs/promises";\nimport { getRelkit } from "relkit";\n' +
    config.replace("  server: { port: 3000 },", onStartServer)
  );
}
