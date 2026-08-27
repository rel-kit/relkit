import { defineAgent } from "@relkit/app";
import { supportInput, supportOutput } from "@app/shared/schemas.js";
import lookupOrder from "@app/tools/lookup-order.tool.js";

const orderSupport = defineAgent({
  input: supportInput,
  output: supportOutput,
  model: "openai:gpt-5-mini",
  instructions: "Answer order questions using the read-only order lookup tool.",
  tools: [lookupOrder],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});

export default orderSupport;
