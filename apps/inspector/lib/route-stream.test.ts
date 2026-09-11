import { expect, test } from "bun:test";
import { invokeActiveRouteStream, type RouteStreamFrame } from "./route-request";

test("native stream explorer reports SSE terminal events without buffering forever", async () => {
  const frames: RouteStreamFrame[] = [];
  const result = await invokeActiveRouteStream(
    async () =>
      new Response(
        stream([
          'event: relkit-item\ndata: {"value":1}\n\n',
          'event: relkit-complete\ndata: {"ok":true}\n\n',
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    "/_relkit/backend",
    {},
    { path: "/reports/one", init: { method: "GET" } },
    "sse",
    (frame) => frames.push(frame),
    new AbortController().signal,
  );
  expect(result.body).toEqual({ terminal: "complete" });
  expect(frames).toEqual([
    { kind: "sse", event: "relkit-item", data: { value: 1 } },
    { kind: "sse", event: "relkit-complete", data: { ok: true } },
  ]);
});

function stream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}
