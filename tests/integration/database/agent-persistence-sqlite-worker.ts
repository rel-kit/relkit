import { resolve } from "node:path";
import {
  END,
  START,
  StateSchema,
} from "../../../packages/agents/node_modules/@langchain/langgraph/dist/index.js";
import { SqliteSaver } from "../../../packages/agents/node_modules/@langchain/langgraph-checkpoint-sqlite/dist/index.js";
import {
  defineCheckpointerDb,
  defineGraph,
  defineGraphNode,
  invokeAgent,
  releaseAgentPersistence,
} from "../../../packages/agents/src/index.ts";
import { z } from "../../../packages/schema/src/index.ts";

const [borrowedPath, ownedPath] = process.argv.slice(2);
if (borrowedPath === undefined || ownedPath === undefined) {
  throw new Error("Usage: agent-persistence-sqlite-worker.ts <borrowed-db> <owned-db>");
}

const borrowed = SqliteSaver.fromConnString(resolve(borrowedPath));
const borrowedResource = defineCheckpointerDb({
  id: "ai.borrowed-checkpoints",
  client: borrowed,
});
const borrowedGraph = graph("borrowed-sqlite", borrowedResource);
const beforeExplicitSetup = tableNames(borrowed);

await initialize(borrowed);
await run(borrowedGraph, "borrowed:1");
await releaseAgentPersistence([borrowedGraph]);
const borrowedAfterRelease = {
  open: borrowed.db.open,
  tables: tableNames(borrowed),
  checkpoints: checkpointCount(borrowed),
};
borrowed.db.close();

const owned = SqliteSaver.fromConnString(resolve(ownedPath));
await initialize(owned);
let ownedDisposeCalls = 0;
const ownedResource = defineCheckpointerDb({
  id: "ai.owned-checkpoints",
  client: () => owned,
  dispose: (saver) => {
    ownedDisposeCalls += 1;
    saver.db.close();
  },
});
const ownedGraph = graph("owned-sqlite", ownedResource);
await run(ownedGraph, "owned:1");
await releaseAgentPersistence([ownedGraph]);
await releaseAgentPersistence([ownedGraph]);

process.stdout.write(
  `${JSON.stringify({
    beforeExplicitSetup,
    borrowedAfterRelease,
    ownedAfterRelease: { open: owned.db.open, disposeCalls: ownedDisposeCalls },
  })}\n`,
);

function graph(id: string, checkpointer: ReturnType<typeof defineCheckpointerDb<SqliteSaver>>) {
  const state = new StateSchema({ value: z.string(), result: z.string().optional() });
  const finish = defineGraphNode({
    id: "finish",
    input: z.object({ value: z.string() }),
    output: z.object({ result: z.string() }),
    handler: ({ value }) => ({ result: value }),
  });
  return defineGraph({
    id,
    state,
    input: z.object({ value: z.string() }),
    output: z.object({ result: z.string() }),
    nodes: [finish],
    edges: (edge) => edge.addEdge(START, "finish").addEdge("finish", END),
    checkpointer,
    limits: { maxSteps: 3, maxToolCalls: 1, timeoutMs: 2_000 },
  });
}

async function initialize(saver: SqliteSaver): Promise<void> {
  await saver.getTuple({ configurable: { thread_id: "__relkit_explicit_setup__" } });
}

async function run(agent: ReturnType<typeof graph>, threadId: string): Promise<void> {
  const output = await invokeAgent({
    agent,
    input: { value: "persisted" },
    threadId,
    tools: {},
    engine: { invoke: () => Promise.reject(new Error("unused")) },
  });
  if (JSON.stringify(output) !== '{"result":"persisted"}') {
    throw new Error(`Unexpected graph output: ${JSON.stringify(output)}`);
  }
}

function tableNames(saver: SqliteSaver): readonly string[] {
  return (
    saver.db.prepare("select name from sqlite_master where type = 'table' order by name").all() as {
      readonly name: string;
    }[]
  ).map(({ name }) => name);
}

function checkpointCount(saver: SqliteSaver): number {
  return (
    saver.db.prepare("select count(*) as count from checkpoints").get() as {
      readonly count: number;
    }
  ).count;
}
