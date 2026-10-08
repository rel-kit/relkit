import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { boundedJobsFetch } from "../../src/services/jobs-sdk-fetch.js";

/**
 * Builds a native fetch double retaining Bun's required preconnect capability.
 * @param response - Physically owned response returned by one request.
 * @returns A deterministic native-compatible request authority.
 */
function fetchResponse(response: Response): typeof globalThis.fetch {
  return Object.assign(async () => response, { preconnect: globalThis.fetch.preconnect });
}

it.effect("bounds complete JSON bodies before SDK decoding", () =>
  Effect.promise(async () => {
    const response = await boundedJobsFetch(
      fetchResponse(new Response("12345")),
      () => {},
      4,
    )("http://localhost");
    await expect(response.text()).rejects.toBeInstanceOf(RangeError);
  }),
);

it.effect("rejects declared oversized JSON without reading and keeps cancellation evidence", () =>
  Effect.promise(async () => {
    const cleanup = new Error("reader cancellation failed");
    const issues: unknown[] = [];
    let canceled = 0;
    const source = new Response(
      new ReadableStream({
        cancel() {
          canceled++;
          throw cleanup;
        },
      }),
      { headers: { "content-length": "100" } },
    );
    await expect(
      boundedJobsFetch(fetchResponse(source), (cause) => issues.push(cause), 4)("http://localhost"),
    ).rejects.toBeInstanceOf(RangeError);
    expect(canceled).toBe(1);
    expect(issues).toEqual([cleanup]);
    expect(source.body?.locked).toBe(false);
  }),
);

it.effect("bounds each SSE frame across chunks while permitting a long watch", () =>
  Effect.promise(async () => {
    const chunks = ["data: 1\r", "\n\r", "\ndata: 2\n", "\ndata: 3\n\n"];
    const source = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream", "content-length": "1000" } },
    );
    const response = await boundedJobsFetch(
      fetchResponse(source),
      () => {},
      11,
    )("http://localhost");
    expect(await response.text()).toBe(chunks.join(""));
    expect(source.body?.locked).toBe(false);
  }),
);

it.effect("cancels an oversized SSE frame once and retains the primary limit error", () =>
  Effect.promise(async () => {
    const cleanup = new Error("SSE cleanup failed");
    const issues: unknown[] = [];
    let canceled = 0;
    const source = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: too large\n\n"));
        },
        cancel() {
          canceled++;
          throw cleanup;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const response = await boundedJobsFetch(
      fetchResponse(source),
      (cause) => issues.push(cause),
      8,
    )("http://localhost");
    await expect(response.text()).rejects.toBeInstanceOf(RangeError);
    expect(canceled).toBe(1);
    expect(issues).toEqual([cleanup]);
    expect(source.body?.locked).toBe(false);
  }),
);

it.effect("matches native SSE MIME and CR-only framing across chunk boundaries", () =>
  Effect.promise(async () => {
    const chunks = ["data: 1\r", "\rdata: 2\r", "\rdata: 3\n", "\n"];
    const source = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        },
      }),
      {
        headers: { "content-type": " Text/Event-Stream; charset=utf-8 ", "content-length": "1000" },
      },
    );
    const response = await boundedJobsFetch(fetchResponse(source), () => {}, 9)("http://localhost");
    expect(await response.text()).toBe(chunks.join(""));
    expect(source.body?.locked).toBe(false);
  }),
);

it.effect("counts split CRLF delimiter bytes toward the original event bound", () =>
  Effect.promise(async () => {
    let canceled = 0;
    const source = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: 1\r\n\r"));
          controller.enqueue(new TextEncoder().encode("\n"));
        },
        cancel() {
          canceled++;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const response = await boundedJobsFetch(
      fetchResponse(source),
      () => {},
      10,
    )("http://localhost");
    await expect(response.text()).rejects.toBeInstanceOf(RangeError);
    expect(canceled).toBe(1);
    expect(source.body?.locked).toBe(false);
  }),
);

it.effect("releases a pending native reader once when the SDK cancels its watch", () =>
  Effect.promise(async () => {
    let canceled = 0;
    const source = new Response(new ReadableStream<Uint8Array>({ cancel: () => void canceled++ }), {
      headers: { "content-type": "text/event-stream" },
    });
    const response = await boundedJobsFetch(fetchResponse(source), () => {})("http://localhost");
    const reader = response.body!.getReader();
    const pending = reader.read();
    await reader.cancel();
    expect((await pending).done).toBe(true);
    expect(canceled).toBe(1);
    expect(source.body?.locked).toBe(false);
  }),
);
