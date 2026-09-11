import { defineAgent } from "@relkit/app/agents";
import { todoListMiddleware } from "langchain";
import { supportInput, supportOutput } from "@app/platform/schemas.js";
import lookupOrder from "@app/orders/tools/lookup-order.tool.js";
import cancelOrder from "@app/orders/tools/cancel-order.tool.js";
import { createCommerceModel } from "./commerce-model.js";
import { orderCheckpoints, orderMemory } from "./order-agent-persistence.js";
import { orderStatus } from "./order-native-tool.js";

const orderSupport = defineAgent({
  // Inputs and final answers remain schema checked around the model call.
  input: supportInput,
  output: supportOutput,
  model: createCommerceModel("support"),
  instructions: "Answer order questions using the read-only order lookup tool.",
  // Only explicitly listed application tools are available to the agent.
  tools: [lookupOrder, cancelOrder, orderStatus],
  middleware: [todoListMiddleware()],
  checkpointer: orderCheckpoints,
  store: orderMemory,
  // Bound both tool use and total execution time.
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 60_000 },
  stateProfile: "agents",
  client: { public: true, state: ["todos"] },
  chat: { input: "message", output: "answer" },
  controls: ["steer", "follow-up", "stop", "approve"],
});

export default orderSupport;
