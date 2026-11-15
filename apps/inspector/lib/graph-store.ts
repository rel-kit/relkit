/**
 * The tab's one copy of the application graph (NF-18). The graph is large and fixed for a
 * generation, and the stream announces generation changes in bursts (a new subscriber is replayed
 * the recent ones), so reloading it for every event fetched it dozens of times for one page.
 */
import type { InspectorGraph } from "./api-types";

/** Who the application says it is: the stream's `generation.changed` data of a session change. */
export interface GenerationHint {
  readonly generationId?: unknown;
  readonly sessionId?: unknown;
}

export interface GraphStoreOptions {
  /** Reads the graph from the network; `fresh` drops what the client cached first. */
  readonly fetch: (fresh: boolean) => Promise<InspectorGraph>;
  /** How long a burst of changes is gathered before the graph is read again. */
  readonly settleMs?: number;
  readonly schedule?: (run: () => void, ms: number) => unknown;
}

/** Called with a graph, or with undefined when it could not be read. */
export type GraphListener = (graph: InspectorGraph | undefined) => void;

export class GraphStore {
  private payload: InspectorGraph | undefined;
  private inflight: Promise<InspectorGraph> | undefined;
  private seen:
    { readonly generationId: string; readonly sessionId: string | undefined } | undefined;
  private pending = false;
  private readonly listeners = new Set<GraphListener>();

  constructor(private readonly options: GraphStoreOptions) {}

  /** The graph read last, if any. */
  get current(): InspectorGraph | undefined {
    return this.payload;
  }

  subscribe(listener: GraphListener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** The graph read last, or one read now; callers that ask together share the read. */
  load(): Promise<InspectorGraph> {
    return this.payload === undefined ? this.read(false) : Promise.resolve(this.payload);
  }

  /**
   * A `generation.changed` event. The graph is read again only when the event names another
   * generation or session than the one seen before; the lifecycle records that name none, and
   * repeats of the same one, change nothing. Changes that arrive together cause one read.
   * @param data - The event's data.
   */
  changed(data: unknown): void {
    const hint = data !== null && typeof data === "object" ? (data as GenerationHint) : {};
    if (typeof hint.generationId !== "string") return;
    const session = typeof hint.sessionId === "string" ? hint.sessionId : undefined;
    const previous = this.seen;
    this.seen = { generationId: hint.generationId, sessionId: session };
    if (previous?.generationId === hint.generationId && previous.sessionId === session) return;
    // The first identity only tells which generation the graph read so far belongs to.
    if (
      previous === undefined &&
      (this.payload === undefined || this.payload.generationId === hint.generationId)
    )
      return;
    if (this.pending) return;
    this.pending = true;
    const schedule = this.options.schedule ?? ((run, ms) => setTimeout(run, ms));
    schedule(() => {
      this.pending = false;
      void this.read(true).catch(() => undefined);
    }, this.options.settleMs ?? 200);
  }

  private read(fresh: boolean): Promise<InspectorGraph> {
    // A read under way when a change arrives may predate it, so a fresh one never joins it.
    if (this.inflight !== undefined && !fresh) return this.inflight;
    const started = this.options.fetch(fresh).then(
      (graph) => {
        if (this.inflight === started) this.inflight = undefined;
        const unchanged =
          this.payload?.generationId === graph.generationId &&
          this.payload?.graphHash === graph.graphHash;
        this.payload = graph;
        if (!unchanged) for (const listener of [...this.listeners]) listener(graph);
        return graph;
      },
      (error: unknown) => {
        if (this.inflight === started) this.inflight = undefined;
        for (const listener of [...this.listeners]) listener(undefined);
        throw error;
      },
    );
    this.inflight = started;
    return started;
  }
}
