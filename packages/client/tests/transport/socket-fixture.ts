/** Deterministic DOM socket seam; native Bun listeners are covered separately. */
export class TestSocket extends EventTarget implements WebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static autoOpen = true;
  static instances: TestSocket[] = [];
  static created = Promise.withResolvers<TestSocket>();
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  binaryType: WebSocket["binaryType"] = "arraybuffer";
  readonly bufferedAmount = 0;
  readonly extensions = "";
  readonly protocol = "";
  readonly url: string;
  readyState: WebSocket["readyState"] = 0;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onopen: WebSocket["onopen"] = null;
  closes = 0;
  readonly sent = Promise.withResolvers<void>();

  /** Allocates the native callback seam without starting network work.
   * @param url - Native endpoint supplied by the transport under test.
   * @param _protocols - Accepted constructor protocols, unused by this fixture.
   * @returns A controllable socket that optionally publishes open on the next microtask. */
  constructor(url: string | URL, _protocols?: string | string[] | import("bun").WebSocketOptions) {
    super();
    this.url = String(url);
    TestSocket.instances.push(this);
    TestSocket.created.resolve(this);
    if (TestSocket.autoOpen)
      queueMicrotask(() => {
        this.readyState = TestSocket.OPEN;
        this.dispatchEvent(new Event("open"));
      });
  }

  /** Publishes request admission without fabricating a server response.
   * @param _data - Exact native payload supplied by the oRPC SDK.
   * @returns Nothing after notifying the fixture waiter. */
  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.resolve();
  }

  /** Retires the fixture without manufacturing an SDK reconnect event.
   * @param _code - Accepted native close code, unused by this fixture.
   * @param _reason - Accepted native close reason, unused by this fixture.
   * @returns Nothing after recording exact close ownership. */
  close(_code?: number, _reason?: string): void {
    this.closes++;
    this.readyState = TestSocket.CLOSED;
  }

  /** @returns The retained native endpoint alias exposed by Bun. */
  get URL(): string {
    return this.url;
  }

  /** Accepts Bun keepalive traffic without network work.
   * @param _data - Native optional keepalive payload.
   * @returns Nothing; this fixture has no network peer. */
  ping(_data?: string | ArrayBufferLike | ArrayBufferView): void {}

  /** Accepts Bun keepalive acknowledgements without network work.
   * @param _data - Native optional keepalive payload.
   * @returns Nothing; this fixture has no network peer. */
  pong(_data?: string | ArrayBufferLike | ArrayBufferView): void {}

  /** @returns Nothing after recording fixture termination as close ownership. */
  terminate(): void {
    this.close();
  }
}
