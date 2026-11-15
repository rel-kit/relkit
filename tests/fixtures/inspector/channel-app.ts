/**
 * A small application for the Inspector's channel page under a real `relkit dev`: inspection
 * enabled, local realtime, a public channel `alpha.feed`, a guarded channel `alpha.private` whose
 * guard refuses everyone, and `POST /post`, which triggers `posted` on the public channel.
 */
import { mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDevFixture } from "../../../packages/cli/tests/dev-reload/dev-reload.fixture.js";
import type { DevFixture } from "../../../packages/cli/tests/dev-reload/dev-reload.fixture.types.js";

const repository = resolve(import.meta.dirname, "../../..");

const CONFIG = `import { defineApp } from "relkit";
import { localRealtime } from "@relkit/local";
import env from "./src/platform/env.js";

export default defineApp({
  env,
  inspector: { enabled: true },
  realtime: localRealtime(),
  defaults: { realtime: "default" },
  server: { port: 3000 },
});
`;

const FEED = `import { defineChannel } from "relkit";
import { z } from "zod";

export default defineChannel({
  id: "alpha.feed",
  params: z.object({}),
  events: { posted: z.object({ message: z.string() }) },
  client: { public: true },
});
`;

const PRIVATE = `import { defineChannel } from "relkit";
import { z } from "zod";

export default defineChannel({
  id: "alpha.private",
  params: z.object({}),
  events: { posted: z.object({ message: z.string() }) },
  client: { authorize: async () => false },
});
`;

const POST = `import { defineFunction } from "relkit";
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
`;

const SERVICE = `import { defineService } from "relkit";
import a1 from "./functions/a1.function.js";
import a2 from "./functions/a2.function.js";
import post from "./functions/post.function.js";
import privateChannel from "./channels/private.channel.js";

void privateChannel;
export default defineService({ functions: { a1, a2, post } });
`;

/**
 * Writes the application on top of the development-loop fixture.
 * @returns The application on disk.
 */
export function createChannelFixture(): DevFixture {
  const fixture = createDevFixture();
  fixture.write("relkit.config.ts", CONFIG);
  fixture.write("src/services/alpha/channels/feed.channel.ts", FEED);
  fixture.write("src/services/alpha/channels/private.channel.ts", PRIVATE);
  fixture.write("src/services/alpha/functions/post.function.ts", POST);
  fixture.write("src/services/alpha/service.ts", SERVICE);
  fixture.write(
    "src/routes/post/route.ts",
    'import { defineRoute } from "relkit";\nimport alpha from "../../services/alpha/service.js";\n\nexport const POST = defineRoute({ target: alpha.post });\n',
  );
  mkdirSync(join(fixture.root, "node_modules/@relkit"), { recursive: true });
  symlinkSync(
    join(repository, "integrations/packages/local"),
    join(fixture.root, "node_modules/@relkit/local"),
    "dir",
  );
  return fixture;
}
