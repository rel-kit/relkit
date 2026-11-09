/** Shows the AI SDK stays adapter-only: apps whose agents use LangChain install and load no AI SDK. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const manifest = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, Record<string, string>>;
const aiSdkPackage = (name: string) =>
  name === "ai" || name.startsWith("@ai-sdk/") || name === "@relkit/ai-sdk";
const declared = (path: string) => {
  const json = manifest(path);
  return Object.keys({
    ...json.dependencies,
    ...json.peerDependencies,
    ...json.optionalDependencies,
  });
};

test("the agent template and its runtime packages declare no AI SDK package", () => {
  for (const path of [
    "templates/default/v1/agent/package.json",
    "templates/default/v1/fullstack/package.json",
    "packages/relkit/package.json",
    "packages/cli/package.json",
    "integrations/packages/langchain/package.json",
  ]) {
    expect(declared(path).filter(aiSdkPackage), path).toEqual([]);
  }
});

test("only the AI SDK adapter package depends on the AI SDK", () => {
  expect(manifest("integrations/packages/ai-sdk/package.json").peerDependencies?.ai).toBeDefined();
});
