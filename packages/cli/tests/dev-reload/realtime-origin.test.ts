/**
 * RK-40 end to end: under a real `relkit dev` run by Node, a browser-like `@relkit/client`
 * WebSocket that announces the server's public origin subscribes to a channel through the
 * development proxy and receives an event that a same-origin `POST` publishes.
 */
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createWebSocketClient } from "@relkit/client";
import { afterAll, expect, test } from "bun:test";
import { createDevFixture, startDev } from "./dev-reload.fixture.js";
import type { DevProcess } from "./dev-reload.fixture.types.js";

const fixture = createDevFixture();
const local = join(fixture.root, "node_modules/@relkit/local");
mkdirSync(dirname(local), { recursive: true });
symlinkSync(
  realpathSync(
    resolve(import.meta.dir, "../../../../examples/commerce/node_modules/@relkit/local"),
  ),
  local,
  "dir",
);
fixture.write(
  "relkit.config.ts",
  `import { defineApp } from "relkit";
import { localRealtime } from "@relkit/local";
import env from "./src/platform/env.js";

export default defineApp({
  env,
  realtime: localRealtime(),
  defaults: { realtime: "default" },
  server: { port: 3000 },
});
`,
);
fixture.write(
  "src/services/alpha/channels/feed.channel.ts",
  `import { defineChannel } from "relkit";
import { z } from "zod";

export default defineChannel({
  id: "alpha.feed",
  params: z.object({}),
  events: { posted: z.object({ message: z.string() }) },
  client: { public: true },
});
`,
);
fixture.write(
  "src/services/alpha/functions/post.function.ts",
  `import { defineFunction } from "relkit";
import { z } from "zod";
import feed from "../channels/feed.channel.js";

export default defineFunction({
  input: z.object({ message: z.string() }),
  output: z.object({ accepted: z.boolean() }),
  dependencies: { channels: { feed } },
  handler: async ({ message }, context) => {
    await context.channels.feed.trigger({}, "posted", { message });
    return { accepted: true };
  },
});
`,
);
fixture.write(
  "src/services/alpha/service.ts",
  `import { defineService } from "relkit";
import a1 from "./functions/a1.function.js";
import a2 from "./functions/a2.function.js";
import post from "./functions/post.function.js";

export default defineService({ functions: { a1, a2, post } });
`,
);
fixture.write(
  "src/routes/post/route.ts",
  'import { defineRoute } from "relkit";\nimport alpha from "../../services/alpha/service.js";\n\nexport const POST = defineRoute({ target: alpha.post });\n',
);
let running: DevProcess | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

/** A frame of the subscription stream. */
interface Frame {
  readonly kind: string;
  readonly event?: { readonly name?: string; readonly payload?: unknown };
}

test(
  "relkit dev on node delivers a channel event to a same-origin client WebSocket",
  async () => {
    running = await startDev(fixture.root, true, [], "node");
    const dev = running;
    await dev.waitFor("/a1", "a1 v0");
    const origin = dev.origin;
    // As a browser does: read the identity document, keep its cookies, send them on the socket.
    const identityResponse = await dev.request("/_relkit/v1/client/identity", {
      headers: { origin },
    });
    const identity = (await identityResponse.json()) as Record<string, string>;
    const cookie = identityResponse.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    /** Bun's client with the `Origin` and cookies a browser on the public origin sends. */
    class BrowserSocket extends WebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, { headers: { origin, ...(cookie === "" ? {} : { cookie }) }, protocols });
      }
    }
    const client = createWebSocketClient({
      baseUrl: origin,
      websocket: BrowserSocket,
    }) as unknown as Record<string, (input: unknown) => Promise<AsyncIterable<Frame>>>;
    const stream = await client["relkit.realtime.subscribe"]!({
      channel: "alpha.feed",
      params: {},
      expectedIdentity: {
        identityScope: identity.identityScope,
        sessionEpoch: identity.sessionEpoch,
      },
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value, dev.output().slice(-3_000)).toMatchObject({ kind: "caught-up" });

    const posted = await dev.request("/post", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ message: "hello" }),
    });
    expect(posted.status).toBe(200);
    await posted.body?.cancel();
    const next = await Promise.race([
      iterator.next(),
      Bun.sleep(20_000).then(() => {
        throw new Error(`No channel event.\n${dev.output().slice(-3_000)}`);
      }),
    ]);
    expect(JSON.stringify(next.value)).toContain("hello");
    await iterator.return?.();
  },
  { timeout: 300_000 },
);
