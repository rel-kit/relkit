/**
 * IN-08 / NF-12: the Inspector's channel page connects to a real `relkit dev` on Node and on Bun.
 * Through the Inspector's `/_relkit/backend` path, as the page calls it: the identity call gives
 * the same anonymous identity every time, the browser's own cookies for the application never
 * reach it, a subscribe to a public channel succeeds and receives an event, and a subscribe to a
 * guarded channel gets the application's refusal, concealed as `NOT_FOUND` (D11).
 */
import { createHash } from "node:crypto";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { afterAll, expect, test } from "bun:test";
import { createChannelFixture } from "../fixtures/inspector/channel-app.js";
import { startInspectedDev, type InspectedDev } from "../fixtures/inspector/actions-app.js";
import { toolReply } from "../fixtures/inspector/generated-app.js";

const fixture = createChannelFixture();
let running: InspectedDev | undefined;

afterAll(async () => {
  await running?.stop();
  fixture.remove();
}, 60_000);

/** The anonymous identity scope the application derives from a visitor cookie. */
const visitorScope = (visitor: string) =>
  `sha256:${createHash("sha256").update(`visitor:${visitor}`).digest("hex")}`;

/** A cookie the browser holds for the application's host, which the tool must not forward. */
const BROWSER_COOKIE = "relkit_visitor=browser-visitor; relkit_csrf=browser-csrf";

/** A channel frame. */
interface Frame {
  readonly kind: string;
}

for (const host of ["node", "bun"] as const) {
  test(
    `the Inspector connects to a public channel of relkit dev on ${host}`,
    async () => {
      await running?.stop();
      running = await startInspectedDev(fixture, host);
      const current = running;
      const log = () => current.dev.output().slice(-3_000);
      // The Inspector answers once it is attached to the session.
      await toolReply(current.tool, "/_relkit/v1/graph", "generationId");
      const backend = `${current.inspector}/_relkit/backend`;
      const page = {
        origin: current.inspector,
        "sec-fetch-site": "same-origin",
        cookie: BROWSER_COOKIE,
      };
      let generation = "";
      const identityCall = async () => {
        const response = await fetch(`${backend}/_relkit/v1/client/identity`, { headers: page });
        expect(response.status, log()).toBe(200);
        expect(response.headers.getSetCookie()).toEqual([]);
        generation = response.headers.get("x-relkit-generation-id") ?? "";
        return (await response.json()) as { identityScope: string; sessionEpoch: string };
      };
      const first = await identityCall();
      const second = await identityCall();
      expect(second.identityScope).toBe(first.identityScope);
      // The application did not receive the browser's visitor cookie.
      expect(first.identityScope).not.toBe(visitorScope("browser-visitor"));
      const direct = await current.dev.request("/_relkit/v1/client/identity", {
        headers: { cookie: BROWSER_COOKIE },
      });
      expect(((await direct.json()) as { identityScope: string }).identityScope).toBe(
        visitorScope("browser-visitor"),
      );

      const client = createORPCClient(
        new RPCLink({
          url: `${backend}/_relkit/v1/rpc`,
          headers: {
            ...page,
            "x-relkit-identity-scope": first.identityScope,
            "x-relkit-session-epoch": first.sessionEpoch,
            // As the page does: the generation the identity call answered for.
            "x-relkit-generation-id": generation,
          },
        }),
      ) as unknown as Record<
        string,
        (input: unknown, options?: { signal?: AbortSignal }) => Promise<AsyncIterable<Frame>>
      >;
      const subscribe = (channel: string, signal: AbortSignal) =>
        client["relkit.realtime.subscribe"]!(
          { channel, params: {}, expectedIdentity: first },
          { signal },
        );

      const controller = new AbortController();
      const stream = await subscribe("alpha.feed", controller.signal);
      const iterator = stream[Symbol.asyncIterator]();
      expect((await iterator.next()).value, log()).toMatchObject({ kind: "caught-up" });
      const posted = await current.dev.request("/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hello from the application" }),
      });
      expect(posted.status, log()).toBe(200);
      await posted.body?.cancel();
      const next = await Promise.race([
        iterator.next(),
        Bun.sleep(20_000).then(() => {
          throw new Error(`No channel event.\n${log()}`);
        }),
      ]);
      expect(JSON.stringify(next.value)).toContain("hello from the application");
      controller.abort();
      await iterator.return?.().catch(() => undefined);

      // A denied subscribe is concealed as a missing channel (D11).
      const refused = await (async () => {
        try {
          const frames = await subscribe("alpha.private", AbortSignal.timeout(20_000));
          for await (const frame of frames) return { frame };
          return {};
        } catch (cause) {
          return { cause };
        }
      })();
      expect(refused, log()).toMatchObject({ cause: { code: "NOT_FOUND" } });
    },
    { timeout: 300_000 },
  );
}
