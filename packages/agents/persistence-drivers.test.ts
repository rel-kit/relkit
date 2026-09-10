import { describe, expect, test } from "bun:test";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { MongoDBSaver, MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { ShallowRedisSaver } from "@langchain/langgraph-checkpoint-redis/shallow";
import { RedisStore } from "@langchain/langgraph-checkpoint-redis/store";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

type Constructor<T> = abstract new (...args: any[]) => T;

const savers = [
  SqliteSaver,
  PostgresSaver,
  MongoDBSaver,
  RedisSaver,
  ShallowRedisSaver,
] satisfies readonly Constructor<BaseCheckpointSaver>[];

const stores = [
  PostgresStore,
  MongoDBStore,
  RedisStore,
] satisfies readonly Constructor<BaseStore>[];

describe("native persistence driver cohort", () => {
  test("implements the pinned LangGraph saver and store protocols", () => {
    expect(savers).toHaveLength(5);
    expect(stores).toHaveLength(3);
    for (const saver of savers) {
      expect(typeof saver.prototype.getTuple).toBe("function");
      expect(typeof saver.prototype.put).toBe("function");
    }
    for (const store of stores) expect(typeof store.prototype.batch).toBe("function");
  });
});
