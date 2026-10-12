# Streaming responses

Use a typed stream when one request returns a sequence to its caller. It ends with that request and can be cancelled. A realtime channel notifies connected clients across requests; a job watch follows one accepted background run. Agent and job content streams have their own client contracts.

## `streamOf` with `defineFunction`

Create a function in `src/reports/functions/stream-report.function.ts`:

```ts
import { defineFunction, streamOf } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";

export default defineFunction({
  id: "reports.stream",
  input: z.object({ reportId: z.string().min(1) }),
  output: streamOf(z.object({ completed: z.number().int(), total: z.number().int() })),
  handler: async function* (_input, context) {
    for (let completed = 1; completed <= 10; completed += 1) {
      if (context.signal.aborted) return;
      yield { completed, total: 10 };
    }
  },
});
```

`streamOf(itemSchema)` validates each yielded item. The iterator is lazy and single-consumer; its invocation scope stays open until completion or cancellation. Expose this function from its domain service before mapping it to HTTP.

## `defineRoute` for a stream

In `src/routes/reports/[reportId]/route.ts`, import the public service member:

```ts
import { defineRoute, http } from "@relkit/app/routes";
import reports from "@app/reports/service.js";

export const GET = defineRoute({
  target: reports.streamReport,
  request: http.input({ reportId: http.path("reportId") }),
  client: { operation: "query" },
  stream: { format: "sse" },
});
```

A function-backed stream preserves typed items and failures with the managed client. Native SSE sends `relkit-item` events and an explicit completion or sanitized error event. For custom text, byte, or Web stream responses, use a raw `defineRoute({ handler })` and a Web `Response`. A raw response does not provide the managed item contract.

## `useStream` in React

With `@relkit/client` and a generated route registry:

```tsx
"use client";

import { useStream } from "@relkit/client/react";

export default function Report() {
  const report = useStream("GET /reports/:reportId");

  return (
    <section>
      <button onClick={() => void report.start({ reportId: "daily" })}>Start</button>
      <button onClick={() => report.cancel()}>Cancel</button>
      <p>Status: {report.status}</p>
      <p>Items: {report.items.length}</p>
    </section>
  );
}
```

`useStream` also exposes `reset`. Query-classified streams can opt into `autoStart`; mutation streams require an explicit `start`. Cancelling or ending iteration releases upstream work. Test item validation, normal completion, cancellation, and a failure after the first item by exercising the HTTP/client path.
