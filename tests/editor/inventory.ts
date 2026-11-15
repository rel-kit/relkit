/**
 * Lists the options of every authoring API as the editor suggests them, with the options that
 * show no description and the ones whose name is not a property on the API reference page.
 *
 *   bun tests/editor/inventory.ts
 */
import { join, resolve } from "node:path";
import { EDITORS, FIXTURE } from "./drivers.js";

const HEAD = `
import { defineApp, defineEnv, env } from "relkit/config";
import { defineError, defineFunction } from "relkit/functions";
import { defineEvent, defineEventFunction } from "relkit/events";
import { defineChannel } from "relkit/realtime";
import { defineBucket } from "relkit/buckets";
import { defineCache } from "relkit/cache";
import { defineTask } from "relkit/tasks";
import { defineJob } from "relkit/jobs";
import { defineRoute, defineServiceRoutes } from "relkit/routes";
import { defineService } from "relkit/services";
import { createApi } from "@relkit/client";
import { createTestApplication } from "@relkit/testing";
import { s } from "relkit/schema";
import orders from "./service.js";
import config from "./relkit.config.js";
import exportOrders from "./export.task.js";
`;
const FUNCTION =
  "defineFunction({ input: s.string(), output: s.string(), handler: (value) => value,";
const CHANNEL = 'defineChannel({ id: "a", params: s.object({}), events: {},';

/** Surface, API page, and a statement whose `|` is inside the options object. */
const SURFACES: readonly (readonly [string, string, string])[] = [
  ["defineApp", "app.mdx", "defineApp({ | });"],
  ["defineApp server", "app.mdx", "defineApp({ env: defineEnv({}), server: { | } });"],
  [
    "defineApp server.apiDocs",
    "app.mdx",
    "defineApp({ env: defineEnv({}), server: { apiDocs: { | } } });",
  ],
  ["defineApp inspector", "app.mdx", "defineApp({ env: defineEnv({}), inspector: { | } });"],
  ["defineApp telemetry", "app.mdx", "defineApp({ env: defineEnv({}), telemetry: { | } });"],
  ["defineApp defaults", "app.mdx", "defineApp({ env: defineEnv({}), defaults: { | } });"],
  ["defineApp check", "app.mdx", "defineApp({ env: defineEnv({}), check: { | } });"],
  ["env factories", "config.mdx", "env.|;"],
  ["env factory modifiers", "config.mdx", "env.string().|;"],
  ["defineFunction", "functions.mdx", "defineFunction({ | });"],
  ["defineFunction access", "functions.mdx", `${FUNCTION} access: { | } });`],
  [
    "defineFunction dependencies",
    "functions.mdx",
    `${FUNCTION} dependencies: { functions: {}, | } });`,
  ],
  ["defineError", "functions.mdx", "defineError({ | });"],
  ["defineRoute", "routes.mdx", "defineRoute({ | });"],
  [
    "defineServiceRoutes entry",
    "routes.mdx",
    'defineServiceRoutes(orders, { GET: { member: "createOrder", | } });',
  ],
  ["defineEvent", "events.mdx", "defineEvent({ | });"],
  ["defineEventFunction", "events.mdx", "defineEventFunction({ | });"],
  ["defineChannel", "realtime.mdx", "defineChannel({ | });"],
  ["defineChannel client", "realtime.mdx", `${CHANNEL} client: { | } });`],
  ["defineBucket", "buckets.mdx", "defineBucket({ | });"],
  ["defineCache", "cache.mdx", "defineCache({ | });"],
  ["defineTask", "jobs.mdx", "defineTask({ | });"],
  ["defineJob", "jobs.mdx", "defineJob({ | });"],
  [
    "defineJob client",
    "jobs.mdx",
    'defineJob({ name: "a", id: "a", task: exportOrders, client: { | } });',
  ],
  ["defineService", "services.mdx", "defineService({ | });"],
  ["createApi", "client.mdx", "createApi({ | });"],
  ["createTestApplication options", "testing.mdx", "createTestApplication(config, { | });"],
];

const pages = resolve(import.meta.dir, "../../apps/docs/content/docs/api");
const escaped = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const list = (names: readonly string[]): string =>
  names.length === 0 ? "none" : names.map((name) => `\`${name}\``).join(", ");

/** Prints one table row per options object. */
async function run(): Promise<void> {
  const driver = await EDITORS["TypeScript 5.9 language service"]!();
  const file = join(FIXTURE, "inventory.ts");
  let options = 0;
  let silent = 0;
  console.log("| Surface | API page | Options | Without a description | Not on the page |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const [surface, page, statement] of SURFACES) {
    const text = `${HEAD}${statement.replace("|", "")}\n`;
    const entries = await driver.describe(file, text, HEAD.length + statement.indexOf("|"));
    const pageText = await Bun.file(join(pages, page)).text();
    const onPage = (name: string): boolean =>
      new RegExp(`(^|[\\s{(,;])(readonly\\s+)?["']?${escaped(name)}["']?\\??\\s*[:(<]`, "mu").test(
        pageText,
      );
    const undescribed = entries.filter((entry) => !entry.documented).map((entry) => entry.name);
    const missing = entries.filter((entry) => !onPage(entry.name)).map((entry) => entry.name);
    options += entries.length;
    silent += undescribed.length;
    console.log(
      `| ${surface} | \`${page}\` | ${entries.length} | ${undescribed.length}: ${list(undescribed)} | ${list(missing)} |`,
    );
  }
  await driver.close();
  console.log(
    `\n${options} options in ${SURFACES.length} option objects; ${silent} have no description.`,
  );
}

if (import.meta.main) await run();
