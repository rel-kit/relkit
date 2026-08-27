import { defineAgent } from "@relkit/app";
import { z } from "@relkit/schema";
import { lookup } from "../functions/hello.function.js";

export default defineAgent({
  id: "assistant",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: "openai:gpt-5-mini",
  instructions: "Answer greeting questions with the read-only lookup tool.",
  tools: [lookup],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
