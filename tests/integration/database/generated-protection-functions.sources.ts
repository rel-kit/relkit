/** Native functions, direct calls, tools and real HTTP middleware enforce the same user and tenant denial in both physical layouts. */
export const generatedProtectionFunctionSources = {
  "src/services/ownership/errors/denied.error.ts": `/** Native declared denial retains its HTTP mapping and precise subject data. */
import { defineError } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
export default defineError({ id: "ownership.denied", data: z.object({ ownerId: z.string() }), message: "Subject access denied", http: { status: 403 }, retry: "never" });
`,
  "src/services/ownership/functions/read.function.ts": `/** Native function validates ownership even when called directly or through a tool. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { owns } from "@app/platform/ownership.js";
import denied from "../errors/denied.error.js";
export default defineFunction({ id: "ownership.read", input: z.object({ ownerId: z.string(), tenant: z.string() }), output: z.object({ allowed: z.boolean() }), errors: [denied],
  handler: async (input, context) => !await owns(input, context) ? new denied({ ownerId: input.ownerId }) : { allowed: true },
});
`,
  "src/services/ownership/tools/read.tool.ts": `/** Original native tool borrows its guarded function rather than bypassing ownership checks. */
import read from "../functions/read.function.js";
export default read.asTool({ id: "ownership.read-tool", description: "Read an owned subject", sideEffect: "read", approval: "never" });
`,
  "src/services/ownership/functions/direct-read.function.ts": guardedBridge(
    "read.invoke",
    'import read from "./read.function.js";',
    "ownership.direct-read",
  ),
  "src/services/ownership/functions/tool-read.function.ts": guardedBridge(
    "readTool.invoke",
    'import read from "./read.function.js";\nimport readTool from "../tools/read.tool.js";',
    "ownership.tool-read",
  ),
  "src/services/ownership/functions/publish.function.ts": `/** Native publication keeps the original channel descriptor and current request authorization. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { owns } from "@app/platform/ownership.js";
import feed from "../channels/feed.channel.js";
import denied from "../errors/denied.error.js";
export default defineFunction({ id: "ownership.publish", input: z.object({ ownerId: z.string(), tenant: z.string(), message: z.string() }), output: z.object({ accepted: z.boolean() }), errors: [denied],
  handler: async (input, context) => {
    if (!await owns(input, context)) return new denied({ ownerId: input.ownerId });
    await feed.trigger({ ownerId: input.ownerId, tenant: input.tenant }, "changed", { message: input.message });
    return { accepted: true };
  },
});
`,
  "src/services/ownership/functions/presence.function.ts": `/** Native presence inspection uses the same guarded subject and real provider as live channel streams. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { owns } from "@app/platform/ownership.js";
import feed from "../channels/feed.channel.js";
import denied from "../errors/denied.error.js";
export default defineFunction({ id: "ownership.presence", input: z.object({ ownerId: z.string(), tenant: z.string() }), output: z.object({ connections: z.number() }), errors: [denied],
  handler: async (input, context) => {
    if (!await owns(input, context)) return new denied({ ownerId: input.ownerId });
    const presence = await feed.getPresence(input);
    if (typeof presence.connections !== "number") throw new Error("Native presence count was unavailable");
    return { connections: presence.connections };
  },
});
`,
  "src/services/ownership/functions/stream.function.ts": `/** Finite native SSE target validates its original subject and completes under the real request middleware. */
import { defineFunction, streamOf } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import { owns } from "@app/platform/ownership.js";
import read from "./read.function.js";
export default defineFunction({ id: "ownership.stream", input: read.input, output: streamOf(z.object({ phase: z.string() })), handler: async function* (input, context) {
  if (!await owns(input, context)) throw new Error("Subject access denied");
  yield { phase: "start" };
  yield { phase: "complete" };
} });
`,
  "src/routes/ownership/stream/route.ts": `/** Native finite SSE route retains its URL, original target and stream response mapping. */
import { defineRoute } from "@relkit/app/routes";
import ownership from "@app/services/ownership/service.js";
export const GET = defineRoute({ target: ownership.stream, stream: { format: "sse" } });
`,
  "src/services/ownership/service.ts": `/** Exposes only the controlled guarded function facade without new framework authoring APIs. */
import { defineService } from "@relkit/app/services";
import read from "./functions/read.function.js";
import directRead from "./functions/direct-read.function.js";
import toolRead from "./functions/tool-read.function.js";
import publish from "./functions/publish.function.js";
import presence from "./functions/presence.function.js";
import stream from "./functions/stream.function.js";
export default defineService({ functions: { read, directRead, toolRead, publish, presence, stream } });
`,
  "src/routes/middleware/ownership-auth.middleware.ts": `/** Real HTTP middleware rejects anonymous requests before any business function or nested tool invocation. */
import { defineMiddleware } from "@relkit/app/routes";
export default defineMiddleware("/ownership/*", async (context, next, relkit) => {
  if (await relkit.auth.getSession() === null) return context.json({ error: "unauthorized" }, 401);
  await next();
});
`,
  ...ownershipRoutes(),
} as const;

/**
 * Retains declared native failures through a real nested function or tool call while preserving all other rejection channels.
 * @param invoke - Native operation on the controlled original descriptor.
 * @param imports - Exact native source imports for that edge.
 * @param id - Stable explicit compiler identity.
 * @returns Native authoring source for one guarded invocation edge.
 */
function guardedBridge(invoke: string, imports: string, id: string): string {
  return `/** Native nested invocation preserves declared subject denial and original failures. */
import { defineFunction } from "@relkit/app/functions";
${imports}
import denied from "../errors/denied.error.js";
export default defineFunction({ id: ${JSON.stringify(id)}, input: read.input, output: read.output, errors: [denied], handler: async (input) => {
  try { return await ${invoke}(input); }
  catch (cause) {
    if (typeof cause === "object" && cause !== null && "kind" in cause && cause.kind === "application" && "id" in cause && cause.id === "ownership.denied") return new denied({ ownerId: input.ownerId });
    throw cause;
  }
} });
`;
}

/**
 * Mounts the unchanged native URLs and methods through the public service facade.
 * @returns Authored native route modules without middleware-omitting test helpers.
 */
function ownershipRoutes(): Record<string, string> {
  return Object.fromEntries(
    ["read", "directRead", "toolRead", "presence", "publish"].map((member) => [
      `src/routes/ownership/${member}/route.ts`,
      `/** Mounts ${member} through the real native HTTP runtime. */\nimport { defineRoute } from "@relkit/app/routes";\nimport ownership from "@app/services/ownership/service.js";\nexport const ${member === "publish" ? "POST" : "GET"} = defineRoute({ target: ownership.${member} });\n`,
    ]),
  );
}
