import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import assistant from "@app/hello/agents/assistant.agent.js";

export default defineFunction({
  id: "hello.ask-assistant",

  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),

  dependencies: { agents: { assistant } },

  handler: async (input, context) => {
    return context.agents.assistant(input);
  },
});
