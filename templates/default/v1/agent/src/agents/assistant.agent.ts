import { defineAgent } from "@zsys/app";
import { z } from "@zsys/schema";
import lookup from "../tools/lookup.tool.js";

export default defineAgent({
  id: "assistant",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  modelProfile: "default",
  instructions: "Answer greeting questions with the read-only lookup tool.",
  tools: [lookup],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
