import { defineAgent } from "@zsys/app";
import lookupOrder from "../tools/lookup-order.tool.js";
import { emptyInput, orderOutput } from "../shared/schemas.js";

export default defineAgent({
  input: emptyInput,
  output: orderOutput,
  model: "openai:gpt-5-mini",
  instructions: "Answer order questions.",
  tools: [lookupOrder],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
});
