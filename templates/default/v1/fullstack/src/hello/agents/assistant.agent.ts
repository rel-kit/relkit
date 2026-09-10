import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { FakeToolCallingModel, todoListMiddleware, tool } from "langchain";
import lookup from "@app/hello/tools/lookup.tool.js";

const uppercase = tool(async ({ text }) => text.toUpperCase(), {
  name: "uppercase",
  description: "Uppercase text without leaving the process",
  schema: z.object({ text: z.string() }),
});

export default defineAgent({
  id: "hello.assistant",
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: "write_todos",
          args: { todos: [{ content: "Answer the greeting", status: "completed" }] },
          id: "todo-1",
        },
      ],
      [
        {
          name: "relkit_output",
          args: { value: { answer: "Hello from the offline LangChain model." } },
          id: "output-1",
        },
      ],
    ],
  }),
  instructions: "Answer greeting questions with the available tools.",
  tools: [lookup, uppercase],
  middleware: [todoListMiddleware()],
  stateProfile: "default",
  client: {
    public: true,
    state: ["todos"],
    events: { notice: z.object({ message: z.string() }) },
  },
  chat: { input: "message", output: "answer" },
  controls: ["stop"],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
