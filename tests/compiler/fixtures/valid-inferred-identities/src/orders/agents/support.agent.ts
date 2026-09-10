import { defineAgent } from "@relkit/app";
import lookupOrder from "../tools/lookup-order.tool.js";
import { emptyInput, orderOutput } from "../../platform/schemas.js";

const fixtureModel = {
  invoke: async () => {
    throw new Error("Compiler fixtures do not execute models");
  },
} as never;

export default defineAgent({
  input: emptyInput,
  output: orderOutput,
  model: fixtureModel,
  instructions: "Answer order questions.",
  tools: [lookupOrder],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
});
