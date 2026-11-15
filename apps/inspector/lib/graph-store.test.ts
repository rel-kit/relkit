/** NF-18: one page load reads the graph once per generation, not once per event or component. */
import { describe, expect, test } from "bun:test";
import { createInspectorApiClient, type InspectorGraph } from "./api";
import { GraphStore } from "./graph-store";

const graphOf = (generationId: string): InspectorGraph => ({
  protocol: "relkit.inspector",
  version: 1,
  generationId,
  graphHash: `sha256:${generationId}`,
});

/** A tab: the shared client over a counted network, and the store that reads through it. */
function tab(initial = "generation-1") {
  let generation = initial;
  const fetched: string[] = [];
  const client = createInspectorApiClient({
    fetch: async (url) => {
      fetched.push(String(url));
      const answer = generation;
      // Slow enough that components asking together overlap.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json(graphOf(answer));
    },
  });
  const scheduled: (() => void)[] = [];
  const store = new GraphStore({
    read: (fresh) => {
      if (fresh) client.invalidate(["graph"]);
      return client.graph();
    },
    schedule: (run) => scheduled.push(run),
  });
  return {
    client,
    store,
    fetched,
    /** Runs the reads that were waiting for a burst to settle. */
    settle: async () => {
      scheduled.splice(0).forEach((run) => run());
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
    reload: (next: string) => {
      generation = next;
    },
  };
}

const named = (generationId: string, sessionId = "session-1") => ({
  state: "connected",
  generationId,
  sessionId,
});

describe("graph fetches", () => {
  test("components that ask together share one request", async () => {
    const { client, store, fetched } = tab();
    await Promise.all([client.graph(), client.graph(), store.load(), client.graph(), store.load()]);
    expect(fetched).toHaveLength(1);
  });

  test("the graph is kept for later pages of the same generation", async () => {
    const { client, store, fetched } = tab();
    await store.load();
    await client.graph();
    await store.load();
    expect(fetched).toHaveLength(1);
  });

  test("27 replayed generation events for the loaded generation read nothing more", async () => {
    const { store, fetched, settle } = tab();
    const loading = store.load();
    for (let index = 0; index < 27; index += 1) store.changed(named("generation-1"));
    await loading;
    for (let index = 0; index < 27; index += 1) store.changed(named("generation-1"));
    await settle();
    expect(fetched).toHaveLength(1);
  });

  test("lifecycle records that name no generation read nothing", async () => {
    const { store, fetched, settle } = tab();
    await store.load();
    for (let index = 0; index < 10; index += 1) store.changed({});
    store.changed(undefined);
    await settle();
    expect(fetched).toHaveLength(1);
  });

  test("a burst that names a new generation reads once and tells the page once", async () => {
    const { store, fetched, settle, reload } = tab();
    await store.load();
    store.changed(named("generation-1"));
    const heard: (string | undefined)[] = [];
    store.subscribe((graph) => heard.push(graph?.generationId));
    reload("generation-2");
    for (let index = 0; index < 10; index += 1) store.changed(named("generation-2"));
    await settle();
    expect(fetched).toHaveLength(2);
    expect(heard).toEqual(["generation-2"]);
    expect(store.current?.generationId).toBe("generation-2");
  });

  test("a new session with the same generation number reads again", async () => {
    const { store, fetched, settle } = tab();
    await store.load();
    store.changed(named("generation-1", "session-1"));
    store.changed(named("generation-1", "session-2"));
    await settle();
    expect(fetched).toHaveLength(2);
  });

  test("a read that finds the same graph does not tell the page again", async () => {
    const { store, settle } = tab();
    await store.load();
    store.changed(named("generation-1", "session-1"));
    const heard: unknown[] = [];
    store.subscribe((graph) => heard.push(graph));
    store.changed(named("generation-1", "session-2"));
    await settle();
    expect(heard).toEqual([]);
  });

  test("a request answered before an invalidation is not joined by the next one", async () => {
    const { client, fetched, reload } = tab();
    const before = client.graph();
    client.invalidate(["graph"]);
    reload("generation-2");
    const after = client.graph();
    expect((await before).generationId).toBe("generation-1");
    expect((await after).generationId).toBe("generation-2");
    expect(fetched).toHaveLength(2);
  });
});
