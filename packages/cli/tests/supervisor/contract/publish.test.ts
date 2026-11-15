import { expect, test } from "bun:test";
import { CLIENT_CONTRACT_EVENTS_PATH } from "relkit/contracts";
import { createContractPublisher } from "../../../src/supervisor/contract-publish.js";

/** Reads SSE text from a response until `count` events have arrived. */
async function readEvents(response: Response, count: number): Promise<string[]> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  const events = () => text.split("\n\n").filter((block) => block.startsWith("event:"));
  while (events().length < count) {
    const next = await reader.read();
    if (next.done) break;
    text += next.value;
  }
  await reader.cancel();
  return events();
}

test("streams a ready event, then a contract event after each successful switch", async () => {
  const contracts = createContractPublisher();
  const controller = new AbortController();
  const response = await contracts.intercept(
    new Request(`http://127.0.0.1:3000${CLIENT_CONTRACT_EVENTS_PATH}`, {
      headers: { origin: "http://127.0.0.1:3001" },
      signal: controller.signal,
    }),
  )!;
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:3001");
  expect(contracts.connections()).toBe(1);
  const reading = readEvents(response, 2);
  contracts.observe({
    type: "outcome",
    sequence: 1,
    phase: "switch",
    outcome: "switch-failed",
    sourceToken: 1,
    generationToken: 2,
  });
  contracts.observe({
    type: "outcome",
    sequence: 2,
    phase: "switch",
    outcome: "switch-succeeded",
    sourceToken: 1,
    generationToken: 3,
  });
  expect(await reading).toEqual([
    'event: ready\ndata: {"generation":0}',
    'event: contract\ndata: {"generation":3}',
  ]);
  controller.abort();
  expect(contracts.connections()).toBe(0);
});

test("leaves other requests to the proxy and stops serving once closed", () => {
  const contracts = createContractPublisher();
  expect(contracts.intercept(new Request("http://127.0.0.1:3000/orders"))).toBeUndefined();
  expect(
    contracts.intercept(
      new Request(`http://127.0.0.1:3000${CLIENT_CONTRACT_EVENTS_PATH}`, { method: "POST" }),
    ),
  ).toBeUndefined();
  contracts.close();
  expect(
    contracts.intercept(new Request(`http://127.0.0.1:3000${CLIENT_CONTRACT_EVENTS_PATH}`)),
  ).toBeUndefined();
});

test("each stream's response names its own request", async () => {
  const contracts = createContractPublisher();
  const open = () => {
    const controller = new AbortController();
    const response = contracts.intercept(
      new Request(`http://127.0.0.1:3000${CLIENT_CONTRACT_EVENTS_PATH}`, {
        signal: controller.signal,
      }),
    )!;
    return { controller, response };
  };
  const first = open();
  const second = open();
  const firstId = (await first.response).headers.get("x-request-id");
  const secondId = (await second.response).headers.get("x-request-id");
  expect(firstId).toMatch(/^request-[0-9a-f-]{36}$/);
  expect(secondId).toMatch(/^request-[0-9a-f-]{36}$/);
  expect(secondId).not.toBe(firstId);
  first.controller.abort();
  second.controller.abort();
  expect(contracts.connections()).toBe(0);
});
