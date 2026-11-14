/**
 * One Inspector event stream per tab, shared by every hook that listens (IN-43). Browsers allow
 * about six connections per origin over HTTP/1.1; a stream per hook used two or three per page,
 * so a third tab never connected.
 */
import type { InspectorStreamOptions, StreamEvent, StreamSnapshot } from "./stream-protocol";

/** What a hook hears: the same callbacks a dedicated stream took. */
export interface StreamSubscriber {
  readonly cache?: { readonly invalidate: (tags: readonly string[]) => void };
  readonly onEvent?: (event: StreamEvent) => void;
  readonly onStateChange?: (snapshot: StreamSnapshot) => void;
  readonly onInvalidate?: (tags: readonly string[], event?: StreamEvent) => void;
}

/** The underlying connection; `InspectorStreamClient` satisfies it. */
export interface SharedStreamSource {
  readonly snapshot: StreamSnapshot;
  start(): void;
  stop(): void;
}

export interface SharedStreamOptions {
  /** How long the stream stays open with no subscriber, so a page change does not reconnect. */
  readonly releaseDelayMs?: number;
  readonly schedule?: (run: () => void, ms: number) => unknown;
  readonly cancel?: (timer: unknown) => void;
}

export class SharedInspectorStream {
  private readonly listeners = new Set<StreamSubscriber>();
  private source: SharedStreamSource | undefined;
  private release: unknown;

  constructor(
    private readonly create: (options: InspectorStreamOptions) => SharedStreamSource,
    private readonly options: SharedStreamOptions = {},
  ) {}

  get subscribers(): number {
    return this.listeners.size;
  }

  get snapshot(): StreamSnapshot | undefined {
    return this.source?.snapshot;
  }

  /** @returns A function that removes this subscriber; calling it twice is harmless. */
  subscribe(subscriber: StreamSubscriber): () => void {
    const listener = { ...subscriber };
    this.listeners.add(listener);
    this.cancelRelease();
    if (this.source === undefined) {
      this.source = this.create({
        onStateChange: (snapshot) => {
          for (const item of [...this.listeners]) item.onStateChange?.(snapshot);
        },
        onEvent: (event) => {
          for (const item of [...this.listeners]) item.onEvent?.(event);
        },
        onInvalidate: (tags, event) => {
          for (const item of [...this.listeners]) {
            item.cache?.invalidate(tags);
            item.onInvalidate?.(tags, event);
          }
        },
      });
      this.source.start();
    } else listener.onStateChange?.(this.source.snapshot);
    return () => {
      if (!this.listeners.delete(listener) || this.listeners.size > 0) return;
      this.scheduleRelease();
    };
  }

  private scheduleRelease(): void {
    const close = () => {
      this.release = undefined;
      if (this.listeners.size > 0) return;
      const source = this.source;
      this.source = undefined;
      source?.stop();
    };
    const delay = this.options.releaseDelayMs ?? 1_000;
    const schedule = this.options.schedule ?? ((run, ms) => setTimeout(run, ms));
    this.release = schedule(close, delay);
  }

  private cancelRelease(): void {
    if (this.release === undefined) return;
    const cancel =
      this.options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    cancel(this.release);
    this.release = undefined;
  }
}
