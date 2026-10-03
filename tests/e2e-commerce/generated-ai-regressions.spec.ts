import { expect, test } from "@playwright/test";
import { AGENT_CAPABILITY_VALUE } from "../../packages/contracts/src/version.ts";

test("generated dev host admits its browser origin and classifies malformed AI input", async ({
  page,
}) => {
  const base = process.env.RELKIT_GENERATED_HOST_URL;
  test.skip(
    base === undefined,
    "Start the generated AI validation fixture and set RELKIT_GENERATED_HOST_URL.",
  );
  if (base === undefined) return;
  await page.goto(`${base}/_relkit/v1/api-reference`);
  const result = await page.evaluate(async (capabilities) => {
    const graph = await (await fetch("/_relkit/v1/graph")).json();
    const valid = await fetch("/_relkit/v1/actions/functions/hello.greet/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationId: graph.generationId,
        graphHash: graph.graphHash,
        idempotencyKey: crypto.randomUUID(),
        input: { name: "Browser validation" },
      }),
    });
    const identity = await (await fetch("/_relkit/v1/client/identity")).json();
    const invalid = await fetch("/rpc/relkit.agent.run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relkit-agent-capabilities": capabilities,
        "x-relkit-identity-scope": identity.identityScope,
        "x-relkit-session-epoch": identity.sessionEpoch,
      },
      body: JSON.stringify({
        json: {
          agentId: "hello.consumer",
          kind: "run",
          threadId: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
          payload: {},
        },
      }),
    });
    const channel = await fetch("/rpc/relkit.realtime.subscribe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relkit-identity-scope": identity.identityScope,
        "x-relkit-session-epoch": identity.sessionEpoch,
      },
      body: JSON.stringify({ json: { channel: "validation.feed", params: { topic: 42 } } }),
    });
    const websocket = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(`${location.origin.replace("http", "ws")}/rpc`);
      const timer = setTimeout(() => {
        socket.close();
        resolve(false);
      }, 3000);
      socket.onopen = () =>
        setTimeout(() => {
          clearTimeout(timer);
          const open = socket.readyState === WebSocket.OPEN;
          socket.close();
          resolve(open);
        }, 100);
      socket.onclose = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
    return {
      validStatus: valid.status,
      validBody: await valid.json(),
      invalidStatus: invalid.status,
      invalidBody: await invalid.json(),
      channelBody: await channel.text(),
      websocket,
    };
  }, AGENT_CAPABILITY_VALUE);
  expect(result.validStatus).toBe(200);
  expect(result.validBody.output.message).toBe("Hello, Browser validation!");
  expect(result.invalidStatus).toBe(400);
  expect(result.invalidBody.json.code).toBe("BAD_REQUEST");
  expect(result.channelBody).toContain("BAD_REQUEST");
  expect(result.channelBody).not.toContain("INTERNAL_SERVER_ERROR");
  expect(result.websocket).toBe(true);
});
