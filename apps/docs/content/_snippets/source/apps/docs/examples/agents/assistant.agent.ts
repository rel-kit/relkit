/** Answers greeting questions with one RelKit tool, on the model profile bound in relkit.config.ts. */
import { defineAgent } from "relkit/agents";
import { langchain } from "@relkit/langchain";
import { z } from "zod";
import lookup from "./lookup.tool.js";

export default defineAgent({
  id: "hello.assistant",
  runtime: langchain({ model: "default" }),

  input: z.object({ message: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  instructions: "Answer greeting questions. Use the lookup tool to read the greeting for a name.",
  tools: [lookup],

  client: { public: true },
  chat: { input: "message", output: "answer" },
  controls: ["stop"],

  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
