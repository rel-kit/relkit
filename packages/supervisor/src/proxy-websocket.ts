import type { SupervisorDrainLease } from "./drain-types.js";
import type { ActiveSupervisorProxyTarget } from "./proxy.js";

export interface ProxySocketData {
  readonly upstream: WebSocket;
  readonly release: () => void;
  readonly pending: (string | Uint8Array)[];
  queuedBytes: number;
  downstream?: Bun.ServerWebSocket<ProxySocketData>;
}

export const proxyWebSocketHandler: Bun.WebSocketHandler<ProxySocketData> = {
  open(socket) {
    socket.data.downstream = socket;
  },
  message(socket, message) {
    if (socket.data.upstream.readyState === WebSocket.OPEN) {
      socket.data.upstream.send(message);
      return;
    }
    const bytes = typeof message === "string" ? Buffer.byteLength(message) : message.byteLength;
    if (socket.data.queuedBytes + bytes > 4 * 1024 * 1024) {
      socket.close(1009, "Relkit proxy queue limit exceeded.");
      return;
    }
    socket.data.pending.push(message);
    socket.data.queuedBytes += bytes;
  },
  close(socket, code, reason) {
    socket.data.upstream.close(code, reason);
    socket.data.release();
  },
};

export function upgradeProxyWebSocket(
  request: Request,
  server: Bun.Server<ProxySocketData>,
  target: ActiveSupervisorProxyTarget,
  lease?: SupervisorDrainLease,
): Response {
  const targetUrl = new URL(request.url);
  targetUrl.protocol = "ws:";
  targetUrl.hostname = target.hostname;
  targetUrl.port = String(target.port);
  const upstream = new WebSocket(targetUrl, {
    headers: websocketHeaders(request.headers),
    protocols: protocols(request.headers.get("sec-websocket-protocol")),
  });
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    lease?.release();
  };
  const data: ProxySocketData = { upstream, release, pending: [], queuedBytes: 0 };
  upstream.addEventListener("open", () => {
    for (const message of data.pending.splice(0)) upstream.send(message);
    data.queuedBytes = 0;
  });
  upstream.addEventListener("message", (event) => data.downstream?.send(event.data));
  upstream.addEventListener("close", (event) => {
    data.downstream?.close(event.code, event.reason);
    release();
  });
  upstream.addEventListener("error", () => {
    data.downstream?.close(1011, "Upstream failed.");
    release();
  });
  lease?.signal.addEventListener(
    "abort",
    () => {
      upstream.close(1012, "Generation retired.");
      data.downstream?.close(1012, "Generation retired.");
      release();
    },
    { once: true },
  );
  if (server.upgrade(request, { data })) return new Response(null);
  upstream.close(1011, "Proxy upgrade failed.");
  release();
  return new Response("WebSocket upgrade failed.", { status: 400 });
}

function websocketHeaders(headers: Headers): Record<string, string> {
  const allowed = ["authorization", "cookie", "origin", "user-agent", "x-forwarded-for"];
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = headers.get(name);
      return value === null ? [] : [[name, value]];
    }),
  );
}

function protocols(header: string | null): string[] | undefined {
  const values = header
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}
