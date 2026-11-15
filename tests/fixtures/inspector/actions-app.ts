/**
 * A small application for Inspector actions under a real `relkit dev` on Node or Bun: inspection
 * enabled, one function (`billing.example`) that publishes one event (`billing.example-event`)
 * through the local event provider, and a `POST /example` route to that function. The dev process
 * is the built CLI (`packages/cli/dist/bin.js`), run by the chosen runtime, and the Inspector tool
 * is the built `packages/inspector/dist/bin.js` attached with `--project-root`.
 */
import { mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createDevFixture,
  startDev,
} from "../../../packages/cli/tests/dev-reload/dev-reload.fixture.js";
import type {
  DevFixture,
  DevProcess,
} from "../../../packages/cli/tests/dev-reload/dev-reload.fixture.types.js";
import { launchGeneratedTool } from "./generated-app.js";

const repository = resolve(import.meta.dirname, "../../..");

const CONFIG = `import { defineApp } from "relkit";
import { localEvent } from "@relkit/local";
import env from "./src/platform/env.js";

export default defineApp({
  env,
  inspector: { enabled: true },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  event: { local: localEvent() },
  defaults: { event: "local" },
});
`;

const EVENT = `import { defineEvent } from "relkit/events";
import { z } from "zod";

const exampleEvent = defineEvent({
  id: "billing.example-event",
  version: 1,
  input: z.object({ value: z.string() }),
  profile: "local",
});
declare global {
  namespace Relkit {
    interface EventRegistry {
      readonly "billing.example-event": typeof exampleEvent;
    }
  }
}
export default exampleEvent;
`;

const FUNCTION = `import { defineFunction } from "relkit/functions";
import { z } from "zod";
import exampleEvent from "../events/example.event.js";

export default defineFunction({
  id: "billing.example",
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  dependencies: { events: { exampleEvent } },
  handler: async ({ value }, context) => {
    await context.events.exampleEvent.publish({ value });
    return { value };
  },
});
`;

const SERVICE = `import { defineService } from "relkit/services";
import exampleEvent from "./events/example.event.js";
import example from "./functions/example.function.js";

export default defineService({ id: "billing", events: { exampleEvent }, functions: { example } });
`;

const ROUTE = `import { defineRoute } from "relkit";
import billing from "../../services/billing/service.js";

export const POST = defineRoute({ target: billing.example });
`;

/**
 * Writes the application on top of the development-loop fixture.
 * @returns The application on disk.
 */
export function createActionsFixture(): DevFixture {
  const fixture = createDevFixture();
  fixture.write("relkit.config.ts", CONFIG);
  fixture.write("src/services/billing/events/example.event.ts", EVENT);
  fixture.write("src/services/billing/functions/example.function.ts", FUNCTION);
  fixture.write("src/services/billing/service.ts", SERVICE);
  fixture.write("src/routes/example/route.ts", ROUTE);
  mkdirSync(join(fixture.root, "node_modules/@relkit"), { recursive: true });
  symlinkSync(
    join(repository, "integrations/packages/local"),
    join(fixture.root, "node_modules/@relkit/local"),
    "dir",
  );
  return fixture;
}

/** A running `relkit dev` with the Inspector tool attached. */
export interface InspectedDev {
  readonly dev: DevProcess;
  readonly tool: Awaited<ReturnType<typeof launchGeneratedTool>>;
  /** The Inspector's own origin, such as `http://127.0.0.1:51234`. */
  readonly inspector: string;
  readonly stop: () => Promise<void>;
}

/**
 * Starts `relkit dev` on one runtime, waits until it serves, then attaches the Inspector tool.
 * @param fixture - Application on disk.
 * @param host - Runtime that runs the CLI.
 * @returns Both processes; `stop` ends the tool, then dev.
 */
export async function startInspectedDev(
  fixture: DevFixture,
  host: "bun" | "node",
): Promise<InspectedDev> {
  const dev = await startDev(fixture.root, true, [], host);
  let tool: Awaited<ReturnType<typeof launchGeneratedTool>> | undefined;
  const stop = async () => {
    try {
      await tool?.close();
    } finally {
      await dev.stop();
    }
  };
  try {
    await dev.waitFor("/a1", "a1 v0");
    tool = await launchGeneratedTool(fixture.root);
    return { dev, tool, inspector: `http://127.0.0.1:${tool.port}`, stop };
  } catch (cause) {
    await stop();
    throw new Error(`Inspected dev did not start.\n${dev.output().slice(-4_000)}`, { cause });
  }
}
