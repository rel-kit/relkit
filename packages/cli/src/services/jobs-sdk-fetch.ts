import { MutableRef, Ref } from "effect";

/**
 * Adapts native fetch to bound JSON responses and each SSE event before SDK decoding.
 * @param fetcher - Borrowed native fetch authority, captured for this one procedure.
 * @param cleanupFailure - Native receipt callback retaining secondary cancellation errors.
 * @param maximumBytes - Raw JSON/event byte bound; defaults to one MiB.
 * @returns Native-compatible fetch; SDK request signals and reader cancellation remain intact.
 * @remarks All Ref mutations are confined to native stream callbacks. SSE counters reset
 * only on a blank line, so a long watch can deliver unlimited individually bounded events.
 */
export function boundedJobsFetch(
  fetcher: typeof globalThis.fetch,
  cleanupFailure: (cause: unknown) => void,
  maximumBytes = 1_048_576,
): typeof globalThis.fetch {
  return Object.assign(
    async (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: RequestInit,
    ): Promise<Response> => {
      const response = await fetcher(input, init);
      if (response.body === null) return response;
      const sse =
        response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
        "text/event-stream";
      const reader = response.body.getReader();
      const state = Ref.makeUnsafe({
        bytes: 0,
        line: 0,
        previousCR: false,
        endedBytes: undefined as number | undefined,
        released: false,
      });
      const releaseLock = () => {
        const current = MutableRef.get(state.ref);
        if (current.released) return;
        MutableRef.set(state.ref, { ...current, released: true });
        reader.releaseLock();
      };
      const cancel = async (reason?: unknown) => {
        if (MutableRef.get(state.ref).released) return;
        try {
          await reader.cancel(reason);
        } catch (cause) {
          cleanupFailure(cause);
        } finally {
          releaseLock();
        }
      };
      const declaredLength = Number(response.headers.get("content-length"));
      if (!sse && Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        const cause = new RangeError("Jobs RPC response exceeded its byte limit.");
        await cancel(cause);
        throw cause;
      }
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (MutableRef.get(state.ref).released) return;
            if (next.done) {
              releaseLock();
              controller.close();
              return;
            }
            const current = MutableRef.get(state.ref);
            let { bytes, line, previousCR, endedBytes } = current;
            for (const byte of next.value) {
              if (sse && previousCR && byte === 10) {
                // A split CRLF is one line ending. Count its LF in the event that owned CR.
                if ((endedBytes === undefined ? ++bytes : endedBytes + 1) > maximumBytes)
                  throw new RangeError("Jobs RPC response exceeded its byte limit.");
                endedBytes = undefined;
                previousCR = false;
                continue;
              }
              endedBytes = undefined;
              bytes++;
              if (bytes > maximumBytes)
                throw new RangeError("Jobs RPC response exceeded its byte limit.");
              if (sse && (byte === 10 || byte === 13)) {
                if (line === 0) {
                  if (byte === 13) endedBytes = bytes;
                  bytes = 0;
                }
                line = 0;
              } else if (sse) line++;
              previousCR = byte === 13;
            }
            MutableRef.set(state.ref, { ...current, bytes, line, previousCR, endedBytes });
            controller.enqueue(next.value);
          } catch (cause) {
            await cancel(cause);
            controller.error(cause);
          }
        },
        cancel,
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
    { preconnect: fetcher.preconnect },
  );
}
