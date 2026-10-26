/** Records monotonic Bun VM parse events, including modules that later throw or leave its cache. */
import { Schema } from "effect";
import type { ScaffoldChild } from "./scaffold-process.types.js";

const Message = Schema.fromJsonString(
  Schema.Struct({
    id: Schema.optional(Schema.Number),
    error: Schema.optional(Schema.Struct({ message: Schema.String })),
    method: Schema.optional(Schema.String),
    params: Schema.optional(Schema.Struct({ url: Schema.optional(Schema.String) })),
  }),
);

/** Bounds connection acquisition and closes a socket whose handshake cannot complete. */
async function awaitSocketOpen(socket: WebSocket) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Owned debugger connection timed out")), 5000);
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Cannot connect to owned native debugger"));
      socket.addEventListener(
        "close",
        () => reject(new Error("Owned debugger closed during handshake")),
        { once: true },
      );
    });
  } catch (cause) {
    socket.close();
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** Native response settlement owned by exactly one debugger connection. */
type Acknowledgements = Map<number, { resolve: () => void; reject: (cause: Error) => void }>;

/** Sends one protocol command with a bounded acknowledgement and retained original transport failure. */
async function postCommand(
  socket: WebSocket,
  pending: Acknowledgements,
  payload: { readonly id: number; readonly method: string; readonly params: Schema.Json },
  fail: (cause: Error) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => fail(new Error(`Native debugger acknowledgement timed out: ${payload.method}`)),
      5000,
    );
    pending.set(payload.id, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    });
    try {
      socket.send(JSON.stringify(payload));
    } catch (cause) {
      fail(new Error("Owned debugger command failed", { cause }));
    }
  });
}

/** Validates bounded VM messages before recording paths or settling an outstanding command. */
function receiveMessage(text: string, files: Set<string>, pending: Acknowledgements) {
  // Bun includes the real compiler's inline source map in its scriptParsed event.
  if (text.length > 33_554_432)
    throw new Error("Native debugger message exceeded its finite text bound");
  const message = Schema.decodeUnknownSync(Message)(text);
  if (message.method === "Debugger.scriptParsed" && message.params?.url !== undefined)
    files.add(message.params.url);
  if (files.size > 50_000) throw new Error("Native debugger script inventory exceeded its bound");
  if (message.id === undefined) return;
  const command = pending.get(message.id);
  pending.delete(message.id);
  if (message.error !== undefined) command?.reject(new Error(message.error.message));
  else command?.resolve();
}

/** Owns one local debugger connection and validates every response before recording script paths. */
async function connectObserver(address: string) {
  const socket = new WebSocket(address);
  const files = new Set<string>();
  const pending: Acknowledgements = new Map();
  let id = 0;
  let terminal: Error | undefined;
  const fail = (cause: Error) => {
    terminal ??= cause;
    for (const command of pending.values()) command.reject(cause);
    pending.clear();
  };
  socket.onmessage = (event) => {
    try {
      if (typeof event.data !== "string") throw new Error("Native debugger did not send text");
      receiveMessage(event.data, files, pending);
    } catch (cause) {
      fail(new Error("Invalid native debugger observation", { cause }));
      socket.close();
    }
  };
  socket.onclose = () => fail(new Error("Native debugger closed before command acknowledgement"));
  await awaitSocketOpen(socket);
  const command = async (method: string, params: Schema.Json = {}) => {
    if (terminal !== undefined) throw terminal;
    if (socket.readyState !== WebSocket.OPEN) throw new Error("Owned debugger is not open");
    await postCommand(socket, pending, { id: ++id, method, params }, fail);
  };
  return { files, command, close: () => socket.close() };
}

/** Waits only for this owned finite fixture's positive control, never an arbitrary machine process. */
async function waitForOutput(child: ScaffoldChild, marker: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const output = child.output();
    if (output.includes(marker)) return output;
    if (child.process.exitCode !== null) throw new Error(`Native fixture exited before ${marker}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Native fixture did not produce ${marker} within 20 seconds`);
}

/**
 * Observes a finite, fully awaited consumer fixture through an acknowledged protocol barrier.
 * The wrapper ends its process only after every queued parse event has reached this observer.
 */
export async function recordConsumerScripts(child: ScaffoldChild, marker: string) {
  const output = await waitForOutput(child, "ws://127.0.0.1:");
  const address = output.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/u)?.[0];
  if (address === undefined) throw new Error("Owned debugger did not publish a loopback URL");
  const observer = await connectObserver(address);
  const timer = setTimeout(() => observer.close(), 25_000);
  try {
    for (const method of [
      "Inspector.enable",
      "Runtime.enable",
      "Debugger.enable",
      "Inspector.initialized",
    ])
      await observer.command(method);
    await waitForOutput(child, marker);
    await observer.command("Runtime.evaluate", { expression: "0" });
    const exit = child.process.exited;
    // Finite probe entries await all tested behavior; no background-service fixture is accepted here.
    await observer.command("Runtime.evaluate", {
      expression: "setTimeout(() => process.exit(process.exitCode ?? 0), 20)",
    });
    const code = await exit;
    if (code !== 0) throw new Error(`Observed native fixture failed with exit code ${code}`);
    return [...observer.files];
  } finally {
    clearTimeout(timer);
    observer.close();
  }
}
