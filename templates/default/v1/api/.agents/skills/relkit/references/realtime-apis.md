# Realtime channels

Use a channel to notify connected clients about a change. Keep the authoritative state in a route or database query; use channel events to refresh or update that state. Application events deliver backend work, while channels deliver live client updates.

## `defineChannel`

Create `src/services/announcements/channels/announcements.channel.ts`:

```ts
import { defineChannel } from "@relkit/app/realtime";
import { z } from "@relkit/app/schema";

const announcements = defineChannel({
  id: "announcements.feed",
  params: z.object({}),
  events: { posted: z.object({ message: z.string(), postedAt: z.string() }) },
  client: { public: true },
  replay: { retentionMs: 300_000, maxEvents: 1_000 },
});

export default announcements;
```

`params` selects a partition, `events` validates named payloads, and `client` controls browser exposure. Omit `client` for backend-only channels. Use `client: { authorize: async (params, context) => ... }` for protected partitions and verify access to the specific resource, not merely that a session exists. `presence: "count"` adds connection counts. A channel with no events must declare presence.

## Publish and subscribe

After the application change succeeds, publish one validated event from a backend function:

```ts
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import announcements from "@app/services/announcements/channels/announcements.channel.js";

export default defineFunction({
  id: "announcements.post",
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ accepted: z.literal(true) }),
  handler: async ({ message }) => {
    await announcements.trigger({}, "posted", {
      message,
      postedAt: new Date().toISOString(),
    });
    return { accepted: true as const };
  },
});
```

The `trigger()` receipt confirms the provider accepted the append; it does not prove delivery to every browser. If a database write and publication must be atomic, use an outbox in the database transaction. A retryable publish can pass a RELKIT-issued `idempotencyKey` as the fourth argument.

In a React client with `@relkit/client`, subscribe using the generated channel registry:

```tsx
"use client";

import { useChannel, useRoute } from "@relkit/client/react";

export default function Announcements() {
  const announcements = useRoute("GET /announcements", { input: {} });
  const channel = useChannel("announcements.feed", {
    params: {},
    on: { posted: () => void announcements.refetch() },
    onCaughtUp: async () => {
      await announcements.refetch();
    },
    onGap: async () => {
      await announcements.refetch();
    },
  });

  return <p>Channel: {channel.status}</p>;
}
```

Load authoritative state through a route before relying on updates. `onGap` must restore it when replay cannot bridge a disconnect. `channel.status` and `channel.caughtUp` report connection and recovery state. `useRealtime()` is the lower-level subscription manager; a channel descriptor's `getPresence(params)` reads presence when declared.

## Provider and verification

Configure a compatible `realtime` provider and `defaults.realtime` in `relkit.config.ts`. For a one-machine app with `@relkit/local` installed, the relevant configuration is:

```ts
import { defineApp } from "@relkit/app/config";
import { localRealtime } from "@relkit/local";
import env from "@app/platform/env.js";

export default defineApp({
  env,
  realtime: localRealtime(),
  defaults: { realtime: "default" },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
```

Merge these fields into an existing `defineApp` while preserving its other providers and settings. Redis supports fanout across application instances. Provider storage, retention, and Redis persistence determine recovery guarantees. Run `bun run check`, `bun run typecheck`, then test publication, browser subscription, reconnect, and gap recovery. Inspect channels in the Inspector while `bun run dev` is running.

The current `relkit add` kinds do not include `channel`. Create the descriptor and provider configuration in the app source.
