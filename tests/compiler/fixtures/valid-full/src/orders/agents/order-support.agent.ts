/** Declares the full compiler fixture support agent using the explicit native integration owner. */
import { defineAgent } from "@relkit/langchain";
import lookupOrder from "../tools/lookup-order.tool.js";
import { agentInput, agentOutput } from "../../platform/schemas.js";

const fixtureModel = {
  invoke: async () => {
    throw new Error("Compiler fixtures do not execute models");
  },
} as never;

const orderSupport = defineAgent({
  id: "orders.support-agent",
  input: agentInput,
  output: agentOutput,
  model: fixtureModel,
  instructions: "Answer order questions.",
  tools: [lookupOrder],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
});

export default orderSupport;
