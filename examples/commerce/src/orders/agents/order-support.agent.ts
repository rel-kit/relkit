import { defineAgent } from "@relkit/app/agents";
import { supportInput, supportOutput } from "@app/platform/schemas.js";
import lookupOrder from "@app/orders/tools/lookup-order.tool.js";

const orderSupport = defineAgent({
  // Inputs and final answers remain schema checked around the model call.
  input: supportInput,
  output: supportOutput,
  model: "openai:gpt-5-mini",
  instructions: "Answer order questions using the read-only order lookup tool.",
  // Only explicitly listed application tools are available to the agent.
  tools: [lookupOrder],
  // Bound both tool use and total execution time.
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});

export default orderSupport;
