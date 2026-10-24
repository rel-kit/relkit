/** Owns native response readers until EOF/cancellation or listener shutdown. */
import { Effect, Exit, Scope } from "effect";
import { connectionAttempt } from "./connection-error.js";

/** Graceful listener retirement closes downstream before canceling its exact upstream reader. */
export const ownInspectionResponse = Effect.fn("Inspection.response")(function* (
  response: Response,
  scope: Scope.Scope,
) {
  if (!response.body) return response;
  const owned = yield* Scope.fork(scope);
  const run = Effect.runPromiseWith(yield* Effect.context<never>());
  const reader = response.body.getReader();
  const { body, close } = inspectionBody(reader, owned, run);
  yield* Scope.addFinalizer(
    owned,
    connectionAttempt("response.close", close).pipe(
      Effect.catchTag("InspectionConnectionError", () =>
        Effect.logWarning("Inspection response cleanup incomplete"),
      ),
    ),
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});

/** Fetch stream callbacks borrow their exact response Scope and captured Effect context. */
function inspectionBody(
  reader: Pick<ReadableStreamDefaultReader<Uint8Array>, "read" | "cancel" | "releaseLock">,
  owned: Scope.Closeable,
  run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
) {
  let closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const close = async () => {
    if (!closed) {
      closed = true;
      controller.close();
    }
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  };
  const body = new ReadableStream<Uint8Array>(
    {
      start: (value) => {
        controller = value;
      },
      pull: async (target) => {
        try {
          const next = await reader.read();
          if (closed) return;
          if (next.done) {
            closed = true;
            target.close();
            await run(Scope.close(owned, Exit.void));
          } else target.enqueue(next.value);
        } catch (cause) {
          if (!closed) {
            closed = true;
            target.error(cause);
            await run(Scope.close(owned, Exit.fail(cause)));
          }
        }
      },
      cancel: async () => {
        if (closed) return;
        closed = true;
        await run(Scope.close(owned, Exit.interrupt()));
      },
    },
    { highWaterMark: 0 },
  );
  return { body, close };
}
