/**
 * 26.1: Inspector actions reach a real `relkit dev` on Node and on Bun. A function invocation, an
 * event publish and a route `POST` sent by a page of the Inspector (its own `Origin`) succeed on
 * both runtimes; the same requests from another site, or marked `Sec-Fetch-Site: cross-site`, are
 * refused by the Inspector before anything reaches the application; and a page on another origin
 * calling the application's port directly is still refused with 403 `origin-denied`.
 */
import { afterAll, expect, test } from "bun:test";
import {
  createActionsFixture,
  startInspectedDev,
  type InspectedDev,
} from "../fixtures/inspector/actions-app.js";
import { toolReply } from "../fixtures/inspector/generated-app.js";

const fixture = createActionsFixture();
let running: InspectedDev | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

const ATTACKER = "http://attacker.example";

/** What the Inspector answered, with its body decoded when it is JSON. */
interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Sends a `POST` through the Inspector's backend proxy, as its pages do.
 * @param running - Dev and tool.
 * @param path - Path below `/_relkit/backend`.
 * @param body - JSON body.
 * @param headers - Browser headers (`Origin`, `Sec-Fetch-Site`) and action headers.
 * @returns Status and body.
 */
async function post(
  running: InspectedDev,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Answer> {
  const response = await fetch(`${running.inspector}/_relkit/backend${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let decoded: unknown = text;
  try {
    decoded = JSON.parse(text);
  } catch {
    // Not JSON: keep the text.
  }
  return { status: response.status, body: decoded };
}

/**
 * Reads the active generation and graph hash the Inspector's pages send with every action.
 * @param running - Dev and tool.
 * @returns The action identity.
 */
async function identity(running: InspectedDev) {
  const graph = JSON.parse(await toolReply(running.tool, "/_relkit/v1/graph", "generationId")) as {
    generationId: string;
    graphHash: string;
  };
  return { generationId: graph.generationId, graphHash: graph.graphHash };
}

for (const host of ["node", "bun"] as const) {
  test(
    `Inspector actions reach relkit dev on ${host} and refuse other sites`,
    async () => {
      await running?.stop();
      running = await startInspectedDev(fixture, host);
      const current = running;
      const action = await identity(current);
      const generation = { "x-relkit-generation-id": action.generationId };
      const page = { origin: current.inspector, "sec-fetch-site": "same-origin", ...generation };
      const invoke = (headers: Record<string, string>) =>
        post(
          current,
          "/_relkit/v1/actions/functions/billing.example/invoke",
          { ...action, idempotencyKey: crypto.randomUUID(), input: { value: "invoked" } },
          { ...headers, "idempotency-key": crypto.randomUUID() },
        );
      const publish = (headers: Record<string, string>) =>
        post(
          current,
          "/_relkit/v1/actions/events/billing.example-event/publish",
          { ...action, idempotencyKey: crypto.randomUUID(), input: { value: "published" } },
          { ...headers, "idempotency-key": crypto.randomUUID() },
        );
      const route = (headers: Record<string, string>) =>
        post(current, "/example", { value: "routed" }, headers);
      const log = () => current.dev.output().slice(-3_000);

      const invoked = await invoke(page);
      expect(invoked, log()).toMatchObject({ status: 200 });
      expect(JSON.stringify(invoked.body)).toContain("invoked");
      const published = await publish(page);
      expect(published, log()).toMatchObject({ status: 200 });
      expect(published.body).toMatchObject({
        action: { outcome: "applied" },
        result: { eventId: "billing.example-event" },
      });
      expect(await route(page), log()).toMatchObject({ status: 200, body: { value: "routed" } });

      await Bun.sleep(500);
      // Dev logs application routes; inspection actions are control-plane and not logged.
      const served = () => current.dev.output().match(/POST \/example → \d+/g);
      const before = served()?.length ?? 0;
      expect(before, log()).toBe(1);
      for (const foreign of [
        { origin: ATTACKER, ...generation },
        { origin: current.inspector, "sec-fetch-site": "cross-site", ...generation },
        { "sec-fetch-site": "cross-site", ...generation },
      ]) {
        for (const send of [invoke, publish, route]) {
          const refused = await send(foreign);
          expect(refused.status, JSON.stringify(foreign)).toBe(403);
          // Refused by the Inspector itself, not by the application's origin check.
          expect(JSON.stringify(refused.body)).not.toContain("origin-denied");
        }
      }
      await Bun.sleep(500);
      // None of the refused requests reached the application.
      expect(served()?.length ?? 0, served()?.join("\n")).toBe(before);

      const direct = await current.dev.request("/example", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ATTACKER },
        body: JSON.stringify({ value: "direct" }),
      });
      expect({ status: direct.status, body: await direct.json() }).toMatchObject({
        status: 403,
        body: { code: "origin-denied" },
      });
    },
    { timeout: 300_000 },
  );
}
