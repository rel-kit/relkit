import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { defineCheckpointerDb, defineMemoryDb } from "@relkit/app/agents";

// Replace these borrowed native drivers with SQLite, Postgres, MongoDB, or Redis in production.
export const orderCheckpoints = defineCheckpointerDb({
  id: "orders.agent-checkpoints",
  client: new MemorySaver(),
});

export const orderMemory = defineMemoryDb({
  id: "orders.agent-memory",
  client: new InMemoryStore(),
});
