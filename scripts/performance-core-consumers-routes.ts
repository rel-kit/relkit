import { strict as assert } from "node:assert";
import { API_BASE_PATH } from "@relkit/contracts";
import { createSupervisorProxy, createSupervisorStateMachine } from "@relkit/supervisor";
import { createPerformanceInspector } from "./performance-core-consumers-fixture.js";
import { measure } from "./performance-support.js";
import type { RouteMeasurements } from "./performance-core-consumers.types.js";

/**
 * Measures safe Inspector queries, actual HTTP proxy traffic and atomic activation.
 * @param signal - Deadline forwarded into loopback requests.
 * @returns Distributions and successful query/request counts including warm-ups.
 */
export async function measureConsumerRoutes(signal: AbortSignal): Promise<RouteMeasurements> {
  const { app, seen, getForbiddenReads, secret } = createPerformanceInspector();
  const forbiddenBefore = getForbiddenReads();
  const path = `${API_BASE_PATH}/requests?limit=1000&routeId=orders.create.http`;
  const denied = await app.request(path);
  assert.equal(denied.status, 401);
  assert.equal(seen.length, 0, "unauthorized reads must not access the query service");
  await denied.body?.cancel();
  const inspectorQuery = await measure(100, async () => {
    signal.throwIfAborted();
    const response = await app.request(path, {
      signal,
      headers: { authorization: "Bearer performance-token" },
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes(secret), "query output must remain redacted");
    assert.equal(JSON.parse(body).items.length, 1);
    assert.equal(seen.at(-1)?.limit, 100, "the query bound must remain enforced");
  });
  assert.equal(getForbiddenReads(), forbiddenBefore, "queries must not read forbidden getters");
  let proxyRequests = 0;
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const origin = new URL(request.url).origin;
      if (request.headers.get("origin") !== origin)
        return new Response("Origin denied", { status: 403 });
      proxyRequests += 1;
      return new Response("performance", { headers: { "x-public-origin": origin } });
    },
  });
  const proxy = createSupervisorProxy({ port: 0 });
  let supervisorProxy;
  try {
    await proxy.listen();
    const url = proxy.url;
    assert.ok(url, "the real proxy must expose its listener");
    const upstreamPort = upstream.port;
    assert.ok(upstreamPort, "the real upstream must expose its listener");
    assert.ok(
      proxy.compareAndSwitch(undefined, {
        token: { sourceToken: 1, generationToken: 1 },
        port: upstreamPort,
      }),
    );
    const foreign = await fetch(url, { signal, headers: { origin: "http://foreign.test" } });
    assert.equal(foreign.status, 403);
    await foreign.body?.cancel();
    supervisorProxy = await measure(100, async () => {
      signal.throwIfAborted();
      const response = await fetch(url, { signal, headers: { origin: url.origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-public-origin"), url.origin);
      assert.equal(await response.text(), "performance");
    });
  } finally {
    try {
      await proxy.stop();
    } finally {
      await upstream.stop(true);
    }
  }
  const candidateActivation = await measure(1_000, async () => {
    signal.throwIfAborted();
    const machine = createSupervisorStateMachine();
    const token = machine.requestSourceChange();
    machine.compileSucceeded(token);
    machine.startSucceeded(token);
    machine.verificationSucceeded(token);
    machine.switchSucceeded(token);
    assert.equal(machine.state, "active");
  });
  assert.equal(seen.length, 110);
  assert.equal(proxyRequests, 110);
  return {
    inspectorQuery,
    supervisorProxy,
    candidateActivation,
    inspectorReads: seen.length,
    proxyRequests,
  };
}
