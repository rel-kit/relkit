/** Adapts the retained native todo scenario to the public model helper and closes each owned model after its case. */
import { afterEach } from "bun:test";
import { createTestModel as model, type TestModelTurn } from "@relkit/langchain/testing";

const models: ReturnType<typeof model>[] = [];
afterEach(async () => {
  for (const owned of models.splice(0)) await owned.close();
});

export function createTestModel(script: readonly TestModelTurn[]) {
  const owned = model({ script });
  models.push(owned);
  return {
    model: owned.languageModel,
    get calls() {
      return owned.calls;
    },
  };
}
