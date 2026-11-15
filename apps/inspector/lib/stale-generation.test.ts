/** NF-16: a page opened before the application reloaded explains the 409 and retries once. */
import { describe, expect, test } from "bun:test";
import { actionAnswer } from "./action-answer";
import { createInspectorApiClient, InspectorApiError } from "./api";
import { invokeFunction } from "./function-invocation";
import { actionPath, isStaleGeneration, postInspectorAction } from "./inspector-actions";

const ENVELOPE = { protocol: "relkit.inspector", version: 1 };

/** A fetch whose action answers 409 `generation.stale` until the body names `current`. */
function reloadedApplication(current: string, graphRequests: string[] = []) {
  const bodies: Record<string, unknown>[] = [];
  const keys: (string | null)[] = [];
  const fetch = async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith("/graph")) {
      graphRequests.push(String(url));
      return Response.json({ ...ENVELOPE, generationId: current, graphHash: "sha256:current" });
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    keys.push(new Headers(init?.headers).get("idempotency-key"));
    // The tool's own refusal is not an Inspector envelope: its protocol is the number 1.
    return body.generationId === current
      ? Response.json({ ...ENVELOPE, output: { ok: true } })
      : Response.json({ protocol: 1, error: "generation.stale" }, { status: 409 });
  };
  return { fetch, bodies, keys };
}

const input = {
  functionId: "hello.greet",
  generationId: "generation-1",
  graphHash: "sha256:old",
  input: {},
  idempotencyKey: "key-1",
};

describe("a stale generation", () => {
  test("the tool's refusal is recognised as stale", async () => {
    const { fetch } = reloadedApplication("generation-2");
    const client = createInspectorApiClient({ fetch, cacheTtlMs: 0 });
    const error = await client
      .request("/_relkit/v1/actions/x", { method: "POST", body: JSON.stringify({}) })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(InspectorApiError);
    expect(isStaleGeneration(error)).toBe(true);
    expect(isStaleGeneration(new InspectorApiError("x", "HTTP_409", 409))).toBe(false);
  });

  test("an invoke retries once with the current generation and the same key", async () => {
    const graphRequests: string[] = [];
    const { fetch, bodies, keys } = reloadedApplication("generation-2", graphRequests);
    const client = createInspectorApiClient({ fetch, cacheTtlMs: 0 });
    const result = await invokeFunction(client, input);
    expect(result.output).toEqual({ ok: true });
    expect(graphRequests).toHaveLength(1);
    expect(bodies.map((body) => [body.generationId, body.graphHash])).toEqual([
      ["generation-1", "sha256:old"],
      ["generation-2", "sha256:current"],
    ]);
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  test("a publish retries the same way", async () => {
    const { fetch, bodies } = reloadedApplication("generation-2");
    const client = createInspectorApiClient({ fetch, cacheTtlMs: 0 });
    await postInspectorAction(
      client,
      actionPath("events", "orders.created", "publish"),
      { generationId: "generation-1", graphHash: "sha256:old" },
      { input: {} },
    );
    expect(bodies.map((body) => body.generationId)).toEqual(["generation-1", "generation-2"]);
    expect(bodies[0]!.idempotencyKey).toBe(bodies[1]!.idempotencyKey);
  });

  test("a call that is current is sent once and never refreshes the graph", async () => {
    const graphRequests: string[] = [];
    const { fetch, bodies } = reloadedApplication("generation-1", graphRequests);
    const client = createInspectorApiClient({ fetch, cacheTtlMs: 0 });
    await invokeFunction(client, input);
    expect(bodies).toHaveLength(1);
    expect(graphRequests).toHaveLength(0);
  });

  test("it retries once only, then says what happened", async () => {
    let posts = 0;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async (url) => {
        if (String(url).endsWith("/graph"))
          return Response.json({ ...ENVELOPE, generationId: "generation-3", graphHash: "h" });
        posts += 1;
        return Response.json({ protocol: 1, error: "generation.stale" }, { status: 409 });
      },
    });
    const error = await invokeFunction(client, input).catch((cause: unknown) => cause);
    expect(posts).toBe(2);
    const answer = actionAnswer(error, "function");
    expect(answer.text).toStartWith("The application reloaded since this page loaded.");
    expect(answer.sent).toBe(false);
  });

  test("another 409 is not retried", async () => {
    let posts = 0;
    const client = createInspectorApiClient({
      cacheTtlMs: 0,
      fetch: async () => {
        posts += 1;
        return Response.json(
          { ...ENVELOPE, error: "RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE" },
          { status: 409 },
        );
      },
    });
    await invokeFunction(client, input).catch(() => undefined);
    expect(posts).toBe(1);
  });

  test("the answer is the sentence, for both ways the API says it", () => {
    const text = "The application reloaded since this page loaded. Try again.";
    for (const code of ["generation.stale", "RELKIT_INSPECTOR_GENERATION_NOT_ACTIVE"])
      expect(actionAnswer(new InspectorApiError(code, code, 409), "event").text).toBe(text);
  });
});
