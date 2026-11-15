/**
 * Socket hygiene at `/_relkit/v1/rpc` (finding 7): a frame the RPC protocol cannot decode closes
 * the socket as invalid data (1007), not as a server failure (1011), and a burst of valid frames
 * is answered without closing the socket.
 */
import { createRequire } from "node:module";

interface RawSocket {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: Buffer) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  send(data: string | Uint8Array): void;
  close(): void;
}
const RawWebSocket = createRequire(
  new URL("../../../packages/relkit/package.json", import.meta.url),
)("ws") as new (url: string, options: { headers: Record<string, string> }) => RawSocket;

/** Malformed frames the audit sent, by name. */
export const MALFORMED_FRAMES: readonly (readonly [string, string | Uint8Array])[] = [
  ["garbage text", "not json at all"],
  ["binary garbage", new Uint8Array([1, 2, 3, 0, 254])],
  ["null", "null"],
  ["a 10,000-deep array", `${"[".repeat(10_000)}${"]".repeat(10_000)}`],
  ["a message without a payload URL", '{"i":"1","p":{}}'],
];

/**
 * Opens a socket as a signed-in browser of the application would.
 * @param origin - The application's origin.
 * @returns The open socket, its received text frames and its close.
 */
async function open(origin: string) {
  const socket = new RawWebSocket(`${origin.replace("http", "ws")}/_relkit/v1/rpc`, {
    headers: { origin, cookie: "session=ada" },
  });
  const received: string[] = [];
  socket.on("message", (data) => received.push(data.toString()));
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  await new Promise<void>((resolve, reject) => {
    socket.on("open", resolve);
    socket.on("error", reject);
  });
  return { socket, received, closed };
}

/**
 * Sends one frame and reads how the server closed the socket.
 * @param origin - The application's origin.
 * @param frame - Frame to send.
 * @returns The close code and reason.
 */
export async function closeAfter(origin: string, frame: string | Uint8Array) {
  const { socket, closed } = await open(origin);
  socket.send(frame);
  return closed;
}

/**
 * Sends a burst of calls to a procedure the endpoint does not serve, each with its own id.
 * @param origin - The application's origin.
 * @param count - Number of frames.
 * @returns How many answers arrived and whether the socket was still open after them.
 */
export async function burst(origin: string, count: number) {
  const { socket, received, closed } = await open(origin);
  let isClosed = false;
  void closed.then(() => (isClosed = true));
  for (let id = 0; id < count; id++)
    socket.send(JSON.stringify({ i: String(id), p: { u: "/no.such.procedure", b: { json: {} } } }));
  const started = performance.now();
  while (received.length < count && !isClosed && performance.now() - started < 3_000)
    await new Promise((resolve) => setTimeout(resolve, 10));
  const answers = received.length;
  socket.close();
  return { answers, open: !isClosed };
}
