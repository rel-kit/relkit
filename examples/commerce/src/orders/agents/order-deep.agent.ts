import { defineAgent } from "@relkit/app/agents";
import { supportInput, supportOutput } from "@app/platform/schemas.js";
import agentWorkspace from "@app/orders/buckets/agent-workspace.bucket.js";
import lookupOrder from "@app/orders/tools/lookup-order.tool.js";
import { createCommerceModel } from "./commerce-model.js";
import { orderCheckpoints, orderMemory } from "./order-agent-persistence.js";

const inventorySpecialist = defineAgent({
  id: "inventory-specialist",
  description: "Checks inventory delegated by the commerce assistant.",
  input: supportInput,
  output: supportOutput,
  instructions: "COMMERCE_INVENTORY_SPECIALIST: answer the delegated inventory question.",
  tools: [lookupOrder],
  limits: { maxSteps: 3, maxToolCalls: 2, timeoutMs: 10_000 },
});

const orderDeep = defineAgent({
  input: supportInput,
  output: supportOutput,
  model: createCommerceModel("deep"),
  instructions: "Delegate inventory checks to the specialist and return its conclusion.",
  tools: [],
  subagents: [inventorySpecialist],
  // Seed these paths in the workspace bucket to inject team-specific guidance.
  skills: ["/skills/commerce/"],
  memory: ["/AGENTS.md"],
  backend: agentWorkspace,
  checkpointer: orderCheckpoints,
  store: orderMemory,
  limits: { maxSteps: 6, maxToolCalls: 4, timeoutMs: 60_000 },
  stateProfile: "agents",
  client: { public: true },
  chat: { input: "message", output: "answer" },
  controls: ["stop"],
});

export default orderDeep;
