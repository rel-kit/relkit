/** Checks native model, tool, checkpointer and public helper inference without executing the probe. */
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MemorySaver } from "@langchain/langgraph";
import { tool } from "langchain";
import { defineAgent, type AgentRuntimeOptions } from "@relkit/langchain";
import { createTestAgent, createTestModel, type TestModelTurn } from "@relkit/langchain/testing";
import { z } from "@relkit/schema";

/** Accepts real engine authority while the compiler checks native objects and inferred input/output. */
export function nativePublicTypes(engine: AgentRuntimeOptions["engine"]) {
  const script: readonly TestModelTurn[] = [{ type: "final", output: { answer: "typed" } }];
  const model = createTestModel({ script });
  const nativeModel: BaseChatModel = model.languageModel;
  const nativeTool = tool(async ({ value }: { value: number }) => ({ doubled: value * 2 }), {
    name: "double",
    description: "Double a number",
    schema: z.object({ value: z.number() }),
  });
  const agent = defineAgent({
    id: "packed.public-types",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    model: nativeModel,
    instructions: "Use the selected native tool.",
    tools: [nativeTool],
    checkpointer: new MemorySaver(),
    limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 5_000 },
  });
  const helper = createTestAgent({ agent, tools: [], engine, script });
  const invoke: (input: { message: string }) => Promise<{ answer: string }> = helper.invoke;
  const closeModel: () => Promise<void> = model.close;
  const closeHelper: () => Promise<void> = helper.close;
  return { helper, invoke, closeModel, closeHelper };
}
