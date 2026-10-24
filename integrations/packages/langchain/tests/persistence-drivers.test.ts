/** Exercises native persistence drivers behavior through the integration owner, preserving the original assertions and scoped test fixtures. */

import { describe, expect, expectTypeOf, test } from "vitest";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import { MongoDBSaver, MongoDBStore } from "@langchain/langgraph-checkpoint-mongodb";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { ShallowRedisSaver } from "@langchain/langgraph-checkpoint-redis/shallow";
import { RedisStore } from "@langchain/langgraph-checkpoint-redis/store";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { defineMemoryDb } from "../src/define-persistence.js";

type Constructor<T> = abstract new (...args: any[]) => T;

const savers = [
  SqliteSaver,
  PostgresSaver,
  MongoDBSaver,
  RedisSaver,
  ShallowRedisSaver,
] satisfies readonly Constructor<BaseCheckpointSaver>[];

const stores = [PostgresStore, MongoDBStore] satisfies readonly Constructor<BaseStore>[];
// RedisStore 1.0.11 is standalone: it lacks BaseStore lifecycle methods and
// its batch declaration does not preserve operation-specific result types.
const redisStore = RedisStore;

describe("native persistence driver cohort", () => {
  test("implements the pinned LangGraph saver and store protocols", () => {
    expect(savers).toHaveLength(5);
    expect([...stores, redisStore]).toHaveLength(3);
    for (const saver of savers) {
      expect(typeof saver.prototype.getTuple).toBe("function");
      expect(typeof saver.prototype.put).toBe("function");
    }
    for (const store of [...stores, redisStore])
      expect(typeof store.prototype.batch).toBe("function");
  });

  test("records the unsupported RedisStore memory declaration", () => {
    expectTypeOf<RedisStore>().not.toExtend<BaseStore>();
    expectTypeOf<RedisStore["batch"]>().not.toExtend<BaseStore["batch"]>();
    expectTypeOf<RedisStore>().not.toExtend<Parameters<typeof defineMemoryDb>[0]["client"]>();
  });
});
