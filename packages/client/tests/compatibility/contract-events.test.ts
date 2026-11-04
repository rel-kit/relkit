import { expect, test } from "bun:test";
import { followContractEvents } from "../../src/react/contract-events.ts";
import { CLIENT_CONTRACT_EVENTS_PATH } from "../../src/wire.ts";

test("follows ready and contract events and reconnects after the stream drops", async () => {
  const encoder = new TextEncoder();
  let connections = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname !== CLIENT_CONTRACT_EVENTS_PATH)
        return new Response("Not found", { status: 404 });
      connections += 1;
      const first = connections === 1;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: ready\ndata: {"generation":1}\n\n'));
            if (first) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              controller.enqueue(
                encoder.encode('event: contract\r\ndata: {"generation":2}\r\n\r\n'),
              );
              controller.close();
            }
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const controller = new AbortController();
  const changes: number[] = [];
  const live: boolean[] = [];
  const following = followContractEvents(
    server.url.origin,
    { changed: () => changes.push(connections), live: (value) => live.push(value) },
    controller.signal,
  );
  while (changes.length < 3) await Bun.sleep(10);
  controller.abort();
  await following;
  await server.stop(true);
  expect(changes).toEqual([1, 1, 2]);
  expect(live.slice(0, 3)).toEqual([true, false, true]);
});

test("stops at once where the backend does not serve the stream", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("Not found", { status: 404 }),
  });
  const changed: string[] = [];
  await followContractEvents(
    server.url.origin,
    { changed: () => changed.push("changed"), live: () => undefined },
    new AbortController().signal,
  );
  await server.stop(true);
  expect(changed).toEqual([]);
});
