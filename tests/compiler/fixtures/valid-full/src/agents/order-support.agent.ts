import { defineAgent } from "@zsys/app";
import lookupOrder from "../tools/lookup-order.tool.js";
import { agentInput, agentOutput } from "../shared/schemas.js";

const orderSupport = defineAgent({
  id: "orders.support-agent",
  input: agentInput,
  output: agentOutput,
  modelProfile: "default",
  instructions: "Answer order questions.",
  tools: [lookupOrder],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
});

export default orderSupport;
