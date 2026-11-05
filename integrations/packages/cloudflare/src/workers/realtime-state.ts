/**
 * Durable Object classes a RelKit Worker exports. `relkit build --runtime workers` re-exports them
 * from the Worker's entry when the graph uses them, and `relkit deploy init cloudflare` declares
 * their bindings and migrations. They use the classic `fetch` interface, so this module imports
 * nothing from `cloudflare:*` and loads on any runtime.
 */

/** The parts of a Durable Object's state the classes use. */
interface DurableObjectStateLike {
  readonly storage: {
    get<Value>(key: string): Promise<Value | undefined>;
    put<Value>(key: string, value: Value): Promise<void>;
  };
}

/** Longest a single wait request is held, in ms; callers loop until their own deadline. */
const MAX_WAIT_MS = 25_000;

/**
 * Holds one realtime profile's state as a JSON document: `/read` returns it, `/compare-and-set`
 * replaces it only when it still equals the expected text (a Durable Object handles one event at a
 * time across storage awaits, so the comparison and the write are atomic), and `/wait` answers once
 * the document changes or the deadline passes, which lets subscribers in any isolate wait without
 * polling.
 * @experimental
 */
export class RelkitRealtimeState {
  readonly #state: DurableObjectStateLike;
  readonly #waiters = new Set<() => void>();
  #version = 0;
  #lock: Promise<void> = Promise.resolve();

  constructor(state: DurableObjectStateLike, _env: unknown) {
    this.#state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const body = (request.method === "POST" ? await request.json() : {}) as Readonly<
      Record<string, unknown>
    >;
    if (path === "/read") return Response.json({ value: await this.#read() });
    if (path === "/compare-and-set")
      return Response.json({ committed: await this.#exclusive(() => this.#compareAndSet(body)) });
    if (path === "/wait") return Response.json({ changed: await this.#wait(body) });
    return new Response("Not found", { status: 404 });
  }

  /**
   * Replaces the document when it still equals the expected text, and wakes waiters.
   * @param body - `{ expected, next }`.
   * @returns Whether the write happened.
   */
  async #compareAndSet(body: Readonly<Record<string, unknown>>): Promise<boolean> {
    if ((await this.#read()) !== (body.expected ?? null)) return false;
    await this.#state.storage.put("state", String(body.next));
    this.#version += 1;
    for (const wake of this.#waiters) wake();
    this.#waiters.clear();
    return true;
  }

  /**
   * Runs one compare-and-set at a time. Input gates already keep a Durable Object's storage reads
   * and writes from interleaving; the lock keeps the comparison and the write atomic without
   * relying on them.
   * @param work - Critical section.
   * @returns Its result.
   */
  #exclusive<Value>(work: () => Promise<Value>): Promise<Value> {
    const result = this.#lock.then(work);
    this.#lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** @returns The stored document, or null before the first write. */
  async #read(): Promise<string | null> {
    return (await this.#state.storage.get<string>("state")) ?? null;
  }

  /**
   * Waits for a write after the document the caller last read.
   * @param body - `{ expected, deadlineMs }`: the text the caller read and its absolute deadline.
   * @returns Whether the document changed.
   */
  async #wait(body: Readonly<Record<string, unknown>>): Promise<boolean> {
    if ((await this.#read()) !== (body.expected ?? null)) return true;
    const deadline = Math.min(Number(body.deadlineMs) || 0, Date.now() + MAX_WAIT_MS);
    const version = this.#version;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, Math.max(0, deadline - Date.now()));
      const waiters = this.#waiters;
      function done() {
        clearTimeout(timer);
        waiters.delete(done);
        resolve();
      }
      waiters.add(done);
    });
    return this.#version !== version;
  }
}
