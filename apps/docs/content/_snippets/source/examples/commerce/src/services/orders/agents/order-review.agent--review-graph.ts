const orderReview = defineGraph({
  state,
  input: z.object({ orderId: z.string() }),
  output: z.object({ result: z.string() }),
  nodes: [inventory, risk, retry, review, finish],
  edges: (edge) =>
    edge
      .addEdge(START, "load-inventory")
      .addEdge(START, "assess-risk")
      .addEdge(["load-inventory", "assess-risk"], "retry")
      .addConditionalEdges("retry", ({ attempts }) => (attempts === 1 ? "again" : "ready"), {
        again: "retry",
        ready: "review",
      })
      .addEdge("finish", END),
  checkpointer: orderCheckpoints,
  store: orderMemory,
  limits: { maxSteps: 10, maxToolCalls: 1, timeoutMs: 20_000 },
  stateProfile: "agents",
  client: {
    public: true,
    state: ["inventory", "risk", "attempts", "approved", "result"],
  },
  controls: ["stop"],
});
