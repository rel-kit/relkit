/**
 * Shared scenario for a channel whose guard reads the caller's session and, as applications do,
 * looks the membership up through `getRelkit()`. The server wraps every request in the
 * application's handle, as the generated server does, and a signed-in user subscribes over the
 * HTTP stream and over a WebSocket that carries the session cookie on its upgrade.
 */
import { createRequire } from "node:module";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRelkit, runWithRelkit, type RelkitHandle } from "relkit/engine";
import { createLocalRealtimeProvider } from "relkit/providers-local";
import { defineChannel } from "relkit/realtime";
import type { RuntimeAdapter } from "relkit/runtime";
import { createApp, createHttpAuthRuntime } from "relkit/runtime-hono";
import { z } from "relkit/schema";
import {
  channelPlan,
  manifest,
} from "../../../packages/relkit/tests/runtime-hono/fixtures/channel-plan.ts";
import { createFixtureClient, createFixtureWebSocketClient } from "./fixture-client.js";

// The `ws` client sends a cookie on the upgrade, as a browser does; the global one cannot.
const NodeWebSocket = createRequire(
  new URL("../../../packages/relkit/package.json", import.meta.url),
)("ws") as new (url: string | URL, options: { headers: Record<string, string> }) => WebSocket;

interface FixtureSession {
  readonly user: { readonly id: string };
  readonly activeCompanyId: string;
}

const members = new Set(["ada@acme"]);
const handle = { members } as unknown as RelkitHandle;
const channel = defineChannel({
  id: "orders.updates",
  params: z.object({ companyId: z.string() }),
  events: { changed: z.object({ value: z.number() }) },
  client: {
    authorize: async ({ companyId }, trusted) => {
      const auth = (trusted as { auth?: { getSession: () => Promise<FixtureSession | null> } })
        .auth;
      const session = await auth?.getSession();
      if (session === null || session === undefined) return false;
      if (session.activeCompanyId !== companyId) return false;
      const { members: rows } = getRelkit() as unknown as { members: Set<string> };
      return rows.has(`${session.user.id}@${companyId}`);
    },
  },
  replay: { retentionMs: 300_000, maxEvents: 100 },
});

/** Reads the fixture's session from its cookie, as Better Auth reads its session token. */
async function sessionOf(headers: Headers): Promise<FixtureSession | null> {
  return /(?:^|;\s*)session=ada(?:;|$)/u.test(headers.get("cookie") ?? "")
    ? { user: { id: "ada" }, activeCompanyId: "acme" }
    : null;
}

/**
 * Starts the application with the given runtime.
 * @param runtime - The runtime adapter whose server and WebSocket upgrade serve the application.
 * @returns The origin, the two clients of the signed-in user, and a cleanup function.
 */
export async function startSessionGuardServer(runtime: RuntimeAdapter) {
  const root = await mkdtemp(join(tmpdir(), "relkit-realtime-guard-"));
  const provider = createLocalRealtimeProvider(root, { pollingMs: 50 });
  const plan = channelPlan();
  const app = createApp({
    upgradeWebSocket: runtime.upgradeWebSocket,
    plan,
    manifest: manifest(plan, channel),
    engine: { invoke: async () => undefined },
    auth: createHttpAuthRuntime({ getSession: sessionOf }),
    clientIdentity: {
      applicationId: "fixture",
      publicFingerprint: "sha256:public",
      resolve: ({ session }) => ({
        identityScope: session === null ? "anonymous" : "user:ada",
        sessionEpoch: "epoch",
      }),
    },
    realtime: {
      applicationId: "fixture",
      environment: "test",
      provider: () => provider,
      trustedContext: ({ request, auth }) => ({ request, auth }),
    },
    transportSecurity: { allowedOrigins: [] },
  });
  const server = await runtime.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request, bindings) => runWithRelkit(handle, () => app.fetch(request, bindings)),
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const headers = { cookie: "session=ada", origin };
  const http = createFixtureClient({ baseUrl: origin, headers });
  const socket = createFixtureWebSocketClient({
    baseUrl: origin,
    websocket: class extends NodeWebSocket {
      constructor(url: string | URL) {
        super(url, { headers });
      }
    } as unknown as typeof WebSocket,
  });
  const close = async () => {
    // Bun 1.3's `stop(true)` never settles once the server closed a socket whose client runs in
    // the same process (the hygiene cases do); the listener is closed by then.
    await Promise.race([server.stop(true), new Promise((resolve) => setTimeout(resolve, 1_000))]);
    await rm(root, { recursive: true, force: true });
  };
  return { origin, http, socket, close };
}

/**
 * Sends a WebSocket handshake with a foreign `Origin` and reads the head of the answer.
 * @param origin - The application's origin.
 * @returns The status line's code and the lower-cased answer.
 */
export function foreignHandshake(origin: string): Promise<{ status: number; raw: string }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname);
    let raw = "";
    const settle = (): void => {
      socket.destroy();
      resolve({ status: Number(/^HTTP\/1\.1 (\d{3})/u.exec(raw)?.[1] ?? 0), raw: raw.toLowerCase() });
    };
    socket.setTimeout(1_000, settle);
    socket.on("error", reject);
    socket.on("end", settle);
    socket.on("data", (chunk) => (raw += chunk.toString("latin1")));
    socket.write(
      [
        "GET /_relkit/v1/rpc HTTP/1.1",
        `Host: ${url.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Origin: http://attacker.example",
        "Cookie: session=ada",
      ].join("\r\n") + "\r\n\r\n",
    );
  });
}

/**
 * Subscribes for a company and reads the first frame.
 * @param client - Either transport's client.
 * @param companyId - Company the channel stream is for.
 * @returns The first frame's kind, or the refusal's code.
 */
export async function firstFrame(
  client: ReturnType<typeof createFixtureClient>,
  companyId: string,
): Promise<string> {
  try {
    const stream = await client["relkit.realtime.subscribe"]({
      channel: channel.id,
      params: { companyId },
      expectedIdentity: { identityScope: "user:ada", sessionEpoch: "epoch" },
    });
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    await iterator.return?.();
    return (first.value as { kind: string }).kind;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}
